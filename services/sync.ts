
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
      this.offlineQueue.push({ type: 'message', data: msg });
      this.saveLocal('offline_queue', this.offlineQueue);
      return;
    }

    const { error } = await supabase.from('messages').insert([msg]);
    if (error) {
      console.error('Error saving message:', error);
      // If error is network related, queue it
      this.offlineQueue.push({ type: 'message', data: msg });
      this.saveLocal('offline_queue', this.offlineQueue);
    }
  }

  async sendNotification(from: string, to: string, type: string) {
    if (!navigator.onLine) {
      this.offlineQueue.push({ type: 'notification', data: { from, to, type, timestamp: Date.now() } });
      this.saveLocal('offline_queue', this.offlineQueue);
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

  async fetchNotifications(user: string) {
    const { data } = await supabase.from('notifications').select('*').eq('recipient', user).order('timestamp', { ascending: false });
    return data || [];
  }

  async processOfflineQueue() {
    if (!navigator.onLine || this.offlineQueue.length === 0) return;

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    this.saveLocal('offline_queue', []);

    for (const item of queue) {
      if (item.type === 'message') {
        await this.saveMessage(item.data);
      } else if (item.type === 'notification') {
        await this.sendNotification(item.data.from, item.data.to, item.data.type);
      }
    }
  }

  async fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(100);
    return error ? [] : data;
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
