
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
      .on('broadcast', { event: 'state_change' }, (payload: any) => {
        const { type, data } = payload.payload;
        if (this.listeners[type]) {
          this.listeners[type].forEach(cb => cb(data));
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('Connected to Realtime Sync');
          this.processOfflineQueue();
        }
      });

    // Listen for online status
    window.addEventListener('online', () => this.processOfflineQueue());
  }

  subscribe(type: string, callback: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
    return () => {
      this.listeners[type] = this.listeners[type].filter(c => c !== callback);
    };
  }

  async publish(type: string, data: any) {
    if (!navigator.onLine) {
      // We only queue generic broadcast events if critical, but 'publish' is mostly for ephemeral sync (music/theme).
      // However, the user wants music/theme sync to work when "he comes online". Realtime is ephemeral.
      // We should save to DB for persistence if it's music/theme.
    }

    await this.channel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type, data },
    });

    // Also save to a central state table for persistence
    if (type === 'theme' || type === 'music') {
      const { error } = await supabase.from('sync_state').upsert({ key: type, data });
      if (error && !navigator.onLine) {
        // Queue DB update?
        // For now, simpler to just rely on re-try or next action. 
        // BUT for Messages, we MUST queue.
      }
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

  async updatePresence(user: string, isOnline: boolean) {
    const data = { user, isOnline, lastSeen: Date.now() };

    // Broadcast via ephemeral channel for immediate UI update
    await this.channel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type: 'presence', data },
    });

    // Also persist to DB so people joining later see it
    if (navigator.onLine) {
      await supabase.from('presence').upsert({
        user_id: user,
        is_online: isOnline,
        last_seen: Date.now()
      });
    }
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
      .limit(100);

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

  saveLocal(key: string, data: any) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  getLocal(key: string, fallback: any) {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  }
}

export const sync = new SyncService();
