
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Link as LinkIcon, Music } from 'lucide-react';
import { sync, supabase } from '../services/sync';
import { User } from '../types';

export const MusicSyncBar: React.FC<{ user: User }> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [ytLink, setYtLink] = useState('');
  const [currentMusic, setCurrentMusic] = useState({ isPlaying: false, ytId: '', title: 'SILENCE', addedBy: '' as User | '', startTime: 0, currentPosition: 0 });
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load YouTube API
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    (window as any).onYouTubeIframeAPIReady = () => {
      console.log('YT API Ready');
    };

    // Initial fetch from database
    const loadInitialState = async () => {
      const { data } = await supabase.from('sync_state').select('*').eq('key', 'music').single();
      if (data?.data) {
        console.log('MusicSync: Loaded initial state from DB:', data.data);
        setCurrentMusic(data.data);
      }
    };
    loadInitialState();

    // Subscribe to broadcast changes (for instant sync)
    const unsubBroadcast = sync.subscribe('music', (data: any) => {
      console.log('MusicSync: Received broadcast update:', data);
      setCurrentMusic(data);
    });

    // Subscribe to database changes (for persistence and cross-tab sync)
    const unsubDB = sync.subscribeToTable('sync_state', (payload: any) => {
      if (payload.new?.key === 'music') {
        console.log('MusicSync: DB change detected:', payload.new.data);
        setCurrentMusic(payload.new.data);
      }
    });

    // Save state on page unload or visibility change
    const saveStateOnExit = () => {
      if (playerRef.current && playerReady) {
        try {
          const currentPosition = playerRef.current.getCurrentTime() || 0;
          const stateToSave = {
            ...currentMusic,
            currentPosition,
            lastSaved: Date.now()
          };
          // Use navigator.sendBeacon for reliable save on unload
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-url.supabase.co';
          const blob = new Blob([JSON.stringify({
            key: 'music',
            data: stateToSave
          })], { type: 'application/json' });
          navigator.sendBeacon(`${supabaseUrl}/rest/v1/sync_state?key=eq.music`, blob);
        } catch (e) {
          console.warn('Could not save state on exit:', e);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveStateOnExit();
      }
    };

    window.addEventListener('beforeunload', saveStateOnExit);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubBroadcast();
      unsubDB();
      window.removeEventListener('beforeunload', saveStateOnExit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync player state with currentMusic
  useEffect(() => {
    if (!currentMusic.ytId) return;

    if (!playerRef.current) {
      if (!(window as any).YT || !(window as any).YT.Player) return;

      console.log('MusicSync: Creating new YouTube player');
      playerRef.current = new (window as any).YT.Player('yt-player-hidden', {
        height: '0',
        width: '0',
        videoId: currentMusic.ytId,
        playerVars: {
          autoplay: currentMusic.isPlaying ? 1 : 0,
          controls: 0,
          showinfo: 0,
          rel: 0,
          enablejsapi: 1,
        },
        events: {
          onReady: (event: any) => {
            console.log('MusicSync: Player ready');
            setPlayerReady(true);

            // Restore position if available
            if (currentMusic.currentPosition && currentMusic.currentPosition > 0) {
              event.target.seekTo(currentMusic.currentPosition, true);
            }

            // Apply play/pause state
            if (currentMusic.isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
          },
          onStateChange: (event: any) => {
            // Handle automatic looping or end of track if needed
            if (event.data === (window as any).YT.PlayerState.ENDED) {
              event.target.playVideo();
            }
          }
        }
      });
    } else {
      // Player already exists, sync state
      if (playerReady) {
        try {
          // Check if video ID changed
          const currentUrl = playerRef.current.getVideoUrl();
          if (currentUrl && !currentUrl.includes(currentMusic.ytId)) {
            console.log('MusicSync: Loading new video:', currentMusic.ytId);
            playerRef.current.loadVideoById(currentMusic.ytId);
            return; // Let onReady handle the rest
          }

          // Get current player state
          const playerState = playerRef.current.getPlayerState();
          const isCurrentlyPlaying = playerState === (window as any).YT.PlayerState.PLAYING;

          // Sync position if there's a significant difference
          if (currentMusic.currentPosition !== undefined && currentMusic.currentPosition > 0) {
            const currentPlayerTime = playerRef.current.getCurrentTime();
            if (Math.abs(currentPlayerTime - currentMusic.currentPosition) > 2) {
              console.log('MusicSync: Seeking to position:', currentMusic.currentPosition);
              playerRef.current.seekTo(currentMusic.currentPosition, true);
            }
          }

          // Sync play/pause state - only if different from current state
          if (currentMusic.isPlaying && !isCurrentlyPlaying) {
            console.log('MusicSync: Playing video');
            playerRef.current.playVideo();
          } else if (!currentMusic.isPlaying && isCurrentlyPlaying) {
            console.log('MusicSync: Pausing video');
            playerRef.current.pauseVideo();
          }
        } catch (e) {
          console.warn('MusicSync: Error syncing player state:', e);
        }
      }
    }
  }, [currentMusic.ytId, currentMusic.isPlaying, currentMusic.currentPosition, playerReady]);

  const handlePlayNew = () => {
    const id = ytLink.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/)?.[2];
    if (!id || id.length !== 11) return;

    const data = {
      isPlaying: true,
      ytId: id,
      title: 'SYNCED BEAT',
      addedBy: user,
      startTime: Date.now()
    };

    sync.publish('music', data);
    setCurrentMusic(data);
    setYtLink('');
    setIsOpen(false);

    if (playerRef.current && playerReady) {
      playerRef.current.loadVideoById(id);
      playerRef.current.playVideo();
    }
  };

  const togglePlayback = async () => {
    // Get current playback position from the player
    let currentPosition = 0;
    if (playerRef.current && playerReady) {
      try {
        currentPosition = playerRef.current.getCurrentTime() || 0;
      } catch (e) {
        console.warn('Could not get current time from player:', e);
      }
    }

    const d = {
      ...currentMusic,
      isPlaying: !currentMusic.isPlaying,
      currentPosition // Sync the exact position where pause/play happened
    };
    sync.publish('music', d);
    setCurrentMusic(d);
  };

  return (
    <>
      {/* Hidden Player Div */}
      <div id="yt-player-hidden" className="fixed -top-[1000px] left-0 pointer-events-none opacity-0" />

      {/* Dynamic Positioning - Top on Mobile, Corner on Desktop */}
      <div
        ref={containerRef}
        className="fixed top-20 left-0 right-0 flex justify-center md:top-auto md:bottom-8 md:right-8 md:left-auto md:justify-end z-[150] pointer-events-none px-4"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          animate={{
            width: isHovered || currentMusic.isPlaying || (typeof window !== 'undefined' && window.innerWidth < 768) ? 'auto' : '44px',
            opacity: isHovered || currentMusic.isPlaying || (typeof window !== 'undefined' && window.innerWidth < 768) ? 1 : 0.4
          }}
          className="bg-[#0f0f0f]/90 backdrop-blur-3xl border border-white/5 rounded-full p-1 flex items-center gap-2 shadow-2xl pointer-events-auto transition-all overflow-hidden"
        >
          <button
            onClick={togglePlayback}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${currentMusic.isPlaying ? 'bg-white text-black' : 'bg-white/[0.03] text-white/20 hover:text-white'}`}
          >
            {currentMusic.isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />}
          </button>

          <motion.div className="flex items-center gap-3 pr-3 whitespace-nowrap">
            <div className="flex flex-col">
              <span className="text-[7px] font-black italic uppercase tracking-[0.2em] leading-none opacity-40">{currentMusic.ytId ? currentMusic.title : 'READY'}</span>
              <span className="text-[6px] font-bold text-white/10 uppercase tracking-widest mt-1 truncate max-w-[80px]">{currentMusic.ytId ? `@${currentMusic.addedBy}` : 'SYSTEM IDLE'}</span>
            </div>
            <button onClick={() => setIsOpen(true)} className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-colors shrink-0"><LinkIcon className="w-2.5 h-2.5" /></button>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
            <motion.div initial={{ scale: 0.98, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, y: 10 }} className="relative w-full max-w-sm bg-[#0a0a0a] border border-white/[0.1] rounded-[2.5rem] p-8 md:p-10 shadow-3xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5"><Music className="w-5 h-5 opacity-40" /></div>
                <h2 className="text-xl font-display font-black italic uppercase tracking-widest">Connect Beat</h2>
              </div>
              <div className="space-y-4">
                <input autoFocus value={ytLink} onChange={e => setYtLink(e.target.value)} placeholder="PASTE YOUTUBE URL..." className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-xs font-bold outline-none focus:border-white/20 transition-all placeholder:text-white/5" />
                <button onClick={handlePlayNew} className="w-full py-4 bg-white text-black rounded-2xl font-black uppercase italic tracking-widest text-[10px] shadow-2xl hover:brightness-90 transition-all">SYNC TUNNEL</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
