
import React, { useState, useEffect, useRef } from 'react';
import { sync } from '../services/sync';
import { User } from '../types';
import { Play, Pause, SkipForward, SkipBack, Disc, Music as MusicIcon } from 'lucide-react';
import { motion } from 'framer-motion';

export const Music: React.FC<{ user: User }> = ({ user }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [song] = useState("Serendipity");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSyncTime = useRef(0);

  // Load initial state from database
  useEffect(() => {
    const loadInitialState = async () => {
      const musicState = await sync.fetchSyncState('music');
      if (musicState) {
        console.log('Music: Loaded state from DB:', musicState);
        setIsPlaying(musicState.isPlaying || false);
        setCurrentTime(musicState.currentTime || 0);
      }
    };
    loadInitialState();
  }, []);

  // Subscribe to broadcast changes
  useEffect(() => {
    const unsub = sync.subscribe('music', (data: any) => {
      console.log('Music: Received sync:', data);
      setIsPlaying(data.isPlaying);
      if (data.currentTime !== undefined) {
        setCurrentTime(data.currentTime);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to database changes for real-time sync
  useEffect(() => {
    const unsub = sync.subscribeToTable('sync_state', (payload: any) => {
      if (payload.new?.key === 'music') {
        const data = payload.new.data;
        console.log('Music: DB change detected:', data);
        setIsPlaying(data.isPlaying || false);
        if (data.currentTime !== undefined) {
          setCurrentTime(data.currentTime);
        }
      }
    });
    return () => unsub();
  }, []);

  // Persist position every 5 seconds when playing
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const newTime = currentTime + 5;
      setCurrentTime(newTime);

      // Save to database
      sync.publish('music', {
        isPlaying,
        currentTime: newTime,
        updatedBy: user
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, user]);

  const toggle = () => {
    const next = !isPlaying;
    setIsPlaying(next);

    // Broadcast and persist
    sync.publish('music', {
      isPlaying: next,
      currentTime,
      updatedBy: user
    });
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm glass p-8 rounded-[48px] flex flex-col items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-white/5">
          <motion.div
            animate={{ width: isPlaying ? '100%' : '0%' }}
            transition={{ duration: 180, ease: 'linear' }}
            className="h-full bg-[var(--accent)]"
          />
        </div>

        <motion.div
          animate={{ rotate: isPlaying ? 360 : 0 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="w-48 h-48 rounded-full bg-gradient-to-br from-[var(--accent)]/40 to-black p-1 shadow-2xl"
        >
          <div className="w-full h-full rounded-full bg-black flex items-center justify-center border-4 border-white/5">
            <Disc className="w-20 h-20 text-white/20" />
            <div className="absolute w-4 h-4 rounded-full bg-black border-2 border-white/20" />
          </div>
        </motion.div>

        <div className="text-center">
          <h3 className="text-2xl font-display font-bold mb-1">{song}</h3>
          <p className="text-gray-500 text-sm">Synchronized with your love</p>
          <p className="text-gray-600 text-xs mt-1">{Math.floor(currentTime / 60)}:{String(currentTime % 60).padStart(2, '0')}</p>
        </div>

        <div className="flex items-center gap-8">
          <button className="text-gray-400 hover:text-white"><SkipBack className="w-6 h-6" /></button>
          <button
            onClick={toggle}
            className="w-16 h-16 bg-[var(--accent)] text-white rounded-full flex items-center justify-center shadow-lg shadow-[var(--accent)]/20 hover:scale-105 transition-all"
          >
            {isPlaying ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white translate-x-1" />}
          </button>
          <button className="text-gray-400 hover:text-white"><SkipForward className="w-6 h-6" /></button>
        </div>

        <div className="w-full space-y-3">
          <div className="flex items-center gap-3 p-3 glass rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><MusicIcon className="w-5 h-5" /></div>
            <div className="flex-1">
              <p className="text-xs font-bold truncate">Up Next: Midnight City</p>
              <p className="text-[10px] text-gray-500">Requested by Anvi</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
