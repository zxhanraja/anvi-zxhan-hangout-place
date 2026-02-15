
import { createClient } from '@supabase/supabase-js';

// Note: These would typically be in process.env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-url.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class SyncService {
  private listeners: Record<string, Function[]> = {};
  private channel: any;
  private offlineQueue: any[] = [];

  constructor() {
    this.offlineQueue = this.getLocal('offline_queue', []);

    // Create a single persistent channel
    this.channel = supabase.channel('hangout_sync');

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        if (this.listeners['presence_sync']) {
          this.listeners['presence_sync'].forEach(cb => cb(state));
        }
      })
      .on('broadcast', { event: 'state_change' }, (payload: any) => {
        const { type, data } = payload;
        console.log(`Sync: Received broadcast [${type}]`, data);
        if (this.listeners[type]) {
          this.listeners[type].forEach(cb => cb(data));
        }
      })
      .subscribe((status: string, err?: any) => {
        if (status === 'SUBSCRIBED') {
          console.log('Sync: Connected to Realtime');
          this.processOfflineQueue();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`Sync: Connection ${status}, re-subscribing...`, err);
          setTimeout(() => {
            console.log('Sync: Attempting to re-subscribe...');
            this.channel.subscribe();
          }, 2000);
        } else {
          console.warn('Sync Status:', status, err);
        }
      });

    // Listen for online status
    window.addEventListener('online', () => this.processOfflineQueue());
  }

  async trackUser(user: string, status: 'online' | 'away' | 'offline') {
    if (this.channel) {
      await this.channel.track({
        user,
        status,
        online_at: new Date().toISOString(),
      });
    }
  }

  subscribe(type: string, callback: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
    return () => {
      this.listeners[type] = this.listeners[type].filter(c => c !== callback);
    };
  }

  async publish(type: string, data: any) {
    // For high-frequency data like drawing, we use broadcast directly
    const status = await this.channel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type, data },
    });

    if (status !== 'ok') {
      console.warn(`Sync: Broadcast [${type}] failed:`, status);
      // If broadcast fails, we might need to re-subscribe if the channel went dead
      if (status === 'error' || status === 'timed out') {
        console.log('Sync: Channel might be dead, re-subscribing...');
        this.channel.subscribe();
      }
    }

    // Also save to a central state table for persistence
    if (type === 'theme' || type === 'music') {
      const { error } = await supabase.from('sync_state').upsert({ key: type, data });
    }
  }

  async saveMessage(msg: any) {
    if (!navigator.onLine) {
      console.log('Offline: Queuing message', msg.id);
      this.addToQueue({ type: 'message', data: msg });
      return;
    }

    try {
      const { error } = await supabase.from('messages').insert([msg]);
      if (error) {
        console.error('Supabase error saving message, queuing...', error);
        this.addToQueue({ type: 'message', data: msg });
      }
    } catch (e) {
      console.error('Network catch saving message, queuing...', e);
      this.addToQueue({ type: 'message', data: msg });
    }
  }

  private addToQueue(item: any) {
    if (!this.offlineQueue.find(q => q.data.id === item.data.id)) {
      this.offlineQueue.push(item);
      this.saveLocal('offline_queue', this.offlineQueue);
    }
    // Trigger any UI listeners that might want to know queue changed
    if (this.listeners['queue_change']) {
      this.listeners['queue_change'].forEach(cb => cb(this.offlineQueue));
    }
  }

  async processOfflineQueue() {
    if (!navigator.onLine || this.offlineQueue.length === 0) return;

    console.log('Processing offline queue...');
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    this.saveLocal('offline_queue', []);

    for (const item of queue) {
      try {
        if (item.type === 'message') {
          const { error } = await supabase.from('messages').insert([item.data]);
          if (error) throw error;
        } else if (item.type === 'notification') {
          await this.sendNotification(item.data.from, item.data.to, item.data.type);
        }
      } catch (e) {
        console.error('Failed to process queue item, returning to queue:', e);
        this.addToQueue(item);
      }
    }

    if (this.listeners['queue_change']) {
      this.listeners['queue_change'].forEach(cb => cb(this.offlineQueue));
    }
  }

  async sendNotification(from: string, to: string, type: string) {
    if (!navigator.onLine) {
      this.addToQueue({ type: 'notification', data: { from, to, type, timestamp: Date.now() } });
      return;
    }
    await supabase.from('notifications').insert([{ sender: from, recipient: to, type, timestamp: Date.now() }]);
  }

  async updatePresence(user: string, status: 'online' | 'away' | 'offline') {
    const isOnline = status === 'online';
    const data = { user, isOnline, status, lastSeen: Date.now() };

    // Use built-in tracking for state sync
    await this.trackUser(user, status);

    // Broadcast via ephemeral channel for immediate UI update (keeping old way for legacy compat if needed)
    await this.channel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type: 'presence', data },
    });

    // Also persist to DB so people joining later see it
    if (navigator.onLine) {
      try {
        await supabase.from('presence').upsert({
          user_id: user,
          is_online: isOnline,
          status,
          last_seen: Date.now()
        }, { onConflict: 'user_id' });
      } catch (e) {
        console.error('Presence upsert error:', e);
      }
    }
  }

  private strokeBuffer: any[] = [];
  private strokeTimer: any = null;

  async saveStroke(type: string, user: string, data: any) {
    if (type === 'clear') {
      this.strokeBuffer = []; // Clear pending strokes
      await this.clearStrokes();
      return;
    }

    // Buffer strokes to reduce DB pressure
    this.strokeBuffer.push({
      type,
      user_id: user,
      data,
      timestamp: Date.now()
    });

    if (!this.strokeTimer) {
      this.strokeTimer = setTimeout(async () => {
        const batch = [...this.strokeBuffer];
        this.strokeBuffer = [];
        this.strokeTimer = null;

        if (navigator.onLine && batch.length > 0) {
          try {
            await supabase.from('canvas_strokes').insert(batch);
          } catch (e) {
            console.error('Error saving strokes batch:', e);
          }
        }
      }, 100); // Save every 100ms for better real-time sync
    }
  }

  async fetchStrokes() {
    const { data, error } = await supabase
      .from('canvas_strokes')
      .select('*')
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching strokes:', error);
      return [];
    }
    return data || [];
  }

  async clearStrokes() {
    await supabase.from('canvas_strokes').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  }

  async updateScore(user: string, points: number) {
    // Fetch current score
    const { data } = await supabase.from('scores').select('score').eq('user_id', user).single();
    const currentScore = data?.score || 0;

    // Upsert new score
    await supabase.from('scores').upsert({
      user_id: user,
      score: currentScore + points,
      updated_at: Date.now()
    });

    // Broadcast update
    await this.channel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type: 'scores', data: { user, score: currentScore + points } },
    });
  }

  async fetchScores() {
    const { data } = await supabase.from('scores').select('*');
    return data || [];
  }

  async fetchNotifications(user: string) {
    const { data } = await supabase.from('notifications').select('*').eq('recipient', user).order('timestamp', { ascending: false });
    return data || [];
  }

  getQueue() {
    return this.offlineQueue;
  }

  async fetchMessages() {
    console.log('Sync: Fetching messages from Supabase...');
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(10000);

    if (error) {
      console.error('Supabase fetch error:', error.message, error.details, error.hint);
      // If we are getting a 404 or connection error, it's likely the URL/Key is wrong
      if (error.message.includes('FetchError') || error.message.includes('Failed to fetch')) {
        console.warn('CRITICAL: Supabase connection failed. Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
      }
      return [];
    }

    console.log(`Sync: Successfully fetched ${data?.length || 0} messages`);
    return data || [];
  }

  async fetchSyncState(key: string) {
    const { data, error } = await supabase
      .from('sync_state')
      .select('data')
      .eq('key', key)
      .single();

    if (error) {
      console.log(`Sync: No state found for key '${key}'`);
      return null;
    }
    return data?.data || null;
  }

  subscribeToTable(table: string, callback: Function) {
    const channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          console.log(`Sync: Table ${table} changed:`, payload);
          callback(payload);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }

  async sendShake(from: string, to: string) {
    await supabase.from('shake_events').insert([{
      sender: from,
      recipient: to,
      timestamp: Date.now(),
      acknowledged: false
    }]);

    // Also broadcast for instant notification
    await this.channel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type: 'shake', data: { from, to, timestamp: Date.now() } },
    });
  }

  async fetchShakes(user: string) {
    const { data } = await supabase
      .from('shake_events')
      .select('*')
      .eq('recipient', user)
      .eq('acknowledged', false)
      .order('timestamp', { ascending: false });
    return data || [];
  }

  async acknowledgeShake(id: string) {
    await supabase
      .from('shake_events')
      .update({ acknowledged: true })
      .eq('id', id);
  }

  saveLocal(key: string, data: any) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  getLocal(key: string, fallback: any) {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  }
}

export const sync = new SyncService();
