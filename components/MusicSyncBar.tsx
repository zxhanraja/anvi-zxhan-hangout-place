
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Link as LinkIcon, Music } from 'lucide-react';
import { sync, supabase } from '../services/sync';
import { User } from '../types';

export const MusicSyncBar: React.FC<{ user: User }> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [ytLink, setYtLink] = useState('');
  const [currentMusic, setCurrentMusic] = useState({ isPlaying: false, ytId: '', title: 'SILENCE', addedBy: '' as User | '' });
  const playerRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Initial fetch
    supabase.from('sync_state').select('*').eq('key', 'music').single().then(({ data }) => {
      if (data) setCurrentMusic(data.data);
    });

    const unsub = sync.subscribe('music', (data: any) => setCurrentMusic(data));
    return () => unsub();
  }, []);

  const handlePlayNew = () => {
    const id = ytLink.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/)?.[2];
    if (!id || id.length !== 11) return;
    const data = { isPlaying: true, ytId: id, title: 'STREAM', addedBy: user, startTime: Date.now() };
    sync.publish('music', data);
    setCurrentMusic(data);
    setYtLink('');
    setIsOpen(false);
  };

  const togglePlayback = () => {
    const d = { ...currentMusic, isPlaying: !currentMusic.isPlaying };
    sync.publish('music', d);
    setCurrentMusic(d);
  };

  return (
    <>
      {currentMusic.ytId && <iframe ref={playerRef} className="fixed -top-[2000px] left-0 pointer-events-none opacity-0" src={`https://www.youtube.com/embed/${currentMusic.ytId}?autoplay=1&controls=0&mute=0&enablejsapi=1&loop=1&playlist=${currentMusic.ytId}${currentMusic.isPlaying ? '' : '&pause=1'}`} allow="autoplay" />}

      {/* Dynamic Positioning - Top on Mobile, Corner on Desktop */}
      <div
        className="fixed top-20 left-0 right-0 flex justify-center md:top-auto md:bottom-8 md:right-8 md:left-auto md:justify-end z-[150] pointer-events-none px-4"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          animate={{
            width: isHovered || currentMusic.isPlaying || window.innerWidth < 768 ? 'auto' : '44px',
            opacity: isHovered || currentMusic.isPlaying || window.innerWidth < 768 ? 1 : 0.4
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
