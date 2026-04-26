
import { createClient } from '@supabase/supabase-js';

// Note: These would typically be in process.env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-url.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class SyncService {
  public sessionId: string;
  private listeners: Record<string, Function[]> = {};
  private mainChannel: any;
  private tableChannels: Record<string, any> = {};
  private offlineQueue: any[] = [];
  private isConnected = false;

  constructor() {
    this.sessionId = Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    this.offlineQueue = this.getLocal('offline_queue', []);
    
    this.initMainChannel();

    // Listen for online status to trigger reconnection
    window.addEventListener('online', () => {
      console.log('Sync: Browser back online, reconnecting...');
      this.reconnect();
    });
  }

  private initMainChannel() {
    if (this.mainChannel) {
      this.mainChannel.unsubscribe();
    }

    this.mainChannel = supabase.channel('hangout_sync');

    this.mainChannel
      .on('presence', { event: 'sync' }, () => {
        const state = this.mainChannel.presenceState();
        this.trigger('presence_sync', state);
      })
      .on('broadcast', { event: 'state_change' }, (payload: any) => {
        const { type, data, senderSessionId } = payload;
        console.log(`Sync: Received broadcast [${type}] from ${senderSessionId}`, data);
        // We pass the full metadata to the listener so it can filter if needed
        this.trigger(type, { data, senderSessionId, type });
      })
      .subscribe((status: string, err?: any) => {
        this.isConnected = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') {
          console.log('Sync: Connected to Realtime');
          this.processOfflineQueue();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`Sync: Connection ${status}, re-subscribing in 3s...`, err);
          setTimeout(() => this.mainChannel.subscribe(), 3000);
        }
      });
  }

  reconnect() {
    this.initMainChannel();
    // Also re-subscribe to all table channels
    Object.keys(this.tableChannels).forEach(tableName => {
      this.tableChannels[tableName].subscribe();
    });
    this.processOfflineQueue();
  }

  private trigger(type: string, data: any) {
    if (this.listeners[type]) {
      this.listeners[type].forEach(cb => cb(data));
    }
  }

  async trackUser(user: string, status: 'online' | 'away' | 'offline') {
    if (this.mainChannel) {
      await this.mainChannel.track({
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
    console.log(`Sync: Publishing [${type}]`, data);

    const status = await this.mainChannel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type, data, senderSessionId: this.sessionId },
    });

    if (status !== 'ok') {
      console.warn(`Sync: Broadcast [${type}] failed:`, status);
      if (status === 'error' || status === 'timed out') {
        this.mainChannel.subscribe();
      }
    }

    // Save to database for persistence
    if (['theme', 'music', 'game'].includes(type)) {
      const { error } = await supabase.from('sync_state').upsert({ 
        key: type, 
        data,
        updated_at: new Date().toISOString()
      });
      if (error) console.error(`Sync: Persistence failed [${type}]`, error);
    }
  }

  async saveMessage(msg: any) {
    if (!navigator.onLine) {
      this.addToQueue({ type: 'message', data: msg });
      return;
    }

    try {
      const { error } = await supabase.from('messages').insert([msg]);
      if (error) this.addToQueue({ type: 'message', data: msg });
    } catch (e) {
      this.addToQueue({ type: 'message', data: msg });
    }
  }

  private addToQueue(item: any) {
    if (!this.offlineQueue.find(q => q.data.id === item.data.id)) {
      this.offlineQueue.push(item);
      this.saveLocal('offline_queue', this.offlineQueue);
    }
    this.trigger('queue_change', this.offlineQueue);
  }

  async processOfflineQueue() {
    if (!navigator.onLine || this.offlineQueue.length === 0) return;

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
        this.addToQueue(item);
      }
    }
    this.trigger('queue_change', this.offlineQueue);
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

    await this.trackUser(user, status);

    await this.mainChannel.send({
      type: 'broadcast',
      event: 'state_change',
      payload: { type: 'presence', data, senderSessionId: this.sessionId },
    });

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

  // --- PERSISTENCE HELPERS ---

  async fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(1000);

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }
    return data || [];
  }

  async fetchSyncState(key: string) {
    const { data, error } = await supabase
      .from('sync_state')
      .select('data')
      .eq('key', key)
      .single();

    return error ? null : data?.data;
  }

  async fetchScores() {
    const { data } = await supabase.from('scores').select('*');
    return data || [];
  }

  async updateScore(user: string, points: number) {
    const { data } = await supabase.from('scores').select('score').eq('user_id', user).single();
    const newScore = (data?.score || 0) + points;

    await supabase.from('scores').upsert({ user_id: user, score: newScore, updated_at: Date.now() });
    
    await this.publish('scores', { user, score: newScore });
  }

  // --- TABLE SUBSCRIPTION HUB ---

  subscribeToTable(table: string, callback: Function) {
    if (!this.tableChannels[table]) {
      this.tableChannels[table] = supabase
        .channel(`${table}_changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          this.trigger(`${table}_table_update`, payload);
        })
        .subscribe();
    }

    const unsub = this.subscribe(`${table}_table_update`, callback);
    return () => {
      unsub();
      // We keep the channel alive as other components might be using it
    };
  }

  // --- CANVAS SYNC ---

  private strokeBuffer: any[] = [];
  private strokeTimer: any = null;

  async saveStroke(type: string, user: string, data: any) {
    if (type === 'clear') {
      this.strokeBuffer = [];
      await supabase.from('canvas_strokes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      return;
    }

    this.strokeBuffer.push({ type, user_id: user, data, timestamp: Date.now() });

    if (!this.strokeTimer) {
      this.strokeTimer = setTimeout(async () => {
        const batch = [...this.strokeBuffer];
        this.strokeBuffer = [];
        this.strokeTimer = null;
        if (navigator.onLine && batch.length > 0) {
          await supabase.from('canvas_strokes').insert(batch);
        }
      }, 200);
    }
  }

  async fetchStrokes() {
    const { data } = await supabase.from('canvas_strokes').select('*').order('timestamp', { ascending: true });
    return data || [];
  }

  // --- MISC ---

  async sendShake(from: string, to: string) {
    await supabase.from('shake_events').insert([{ sender: from, recipient: to, timestamp: Date.now(), acknowledged: false }]);
    await this.publish('shake', { from, to, timestamp: Date.now() });
  }

  async fetchShakes(user: string) {
    const { data } = await supabase.from('shake_events').select('*').eq('recipient', user).eq('acknowledged', false);
    return data || [];
  }

  async acknowledgeShake(id: string) {
    await supabase.from('shake_events').update({ acknowledged: true }).eq('id', id);
  }

  saveLocal(key: string, data: any) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  getLocal(key: string, fallback: any) {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  }

  getQueue() { return this.offlineQueue; }
}

export const sync = new SyncService();
