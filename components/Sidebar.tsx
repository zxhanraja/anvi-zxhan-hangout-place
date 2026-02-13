import React, { useState } from 'react';
import { User } from '../types';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  PenTool,
  Target,
  LogOut,
  Heart,
  Bell
} from 'lucide-react';

interface SidebarProps {
  active: string;
  setActive: (s: string) => void;
  user: User;
  onLogout: () => void;
  accent: string;
  setAccent: (c: string) => void;
  onMissYou: (type: 'shake' | 'missyou') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ active, setActive, user, onLogout, accent, onMissYou }) => {
  const [pulse, setPulse] = useState<'shake' | 'missyou' | null>(null);

  const handleAction = (type: 'shake' | 'missyou') => {
    setPulse(type);
    setTimeout(() => setPulse(null), 1000);
    onMissYou(type);
  };

  const items = [
    { id: 'chat', icon: MessageSquare, label: 'CHAT' },
    { id: 'drawing', icon: PenTool, label: 'STUDIO' },
    { id: 'games', icon: Target, label: 'ARCADE' },
  ];

  return (
    <>
      {/* Precision Desktop Sidebar */}
      <aside className="hidden md:flex w-24 lg:w-72 bg-[#000000] border-r border-white/[0.03] flex-col p-6 z-[200] relative h-full shrink-0">
        <div className="flex items-center gap-4 mb-20 px-2 opacity-30">
          <div className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-white fill-white" />
          </div>
          <div className="hidden lg:block">
            <h1 className="font-display text-sm font-black tracking-[0.3em] uppercase leading-none">TUNNEL</h1>
            <p className="text-[7px] uppercase tracking-widest font-bold mt-1">E2E SECURED</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col items-center lg:items-stretch gap-4">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-12 lg:w-full flex items-center justify-center lg:justify-start gap-5 p-3.5 lg:p-4 rounded-full transition-all group shrink-0 ${active === item.id ? 'bg-white text-black font-black shadow-2xl' : 'text-white/20 hover:bg-white/[0.03] hover:text-white/60'
                }`}
            >
              <item.icon className={`w-5 h-5 shrink-0 ${active === item.id ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
              <span className="hidden lg:block font-black uppercase tracking-widest text-[10px] italic">{item.label}</span>
            </button>
          ))}

          {/* Heart Icon - MISSING U (Below Arcade) */}
          {user === 'Anvi' && (
            <button
              onClick={() => handleAction('missyou')}
              className={`w-12 lg:w-full flex items-center justify-center lg:justify-start gap-5 p-3.5 lg:p-4 rounded-full transition-all group shrink-0 bg-white/[0.03] border border-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.08] ${pulse === 'missyou' ? 'scale-95 bg-white/10' : ''}`}
            >
              <Heart className={`w-5 h-5 shrink-0 ${pulse === 'missyou' ? 'animate-pulse fill-white' : ''}`} />
              <div className="hidden lg:block text-left min-w-0">
                <span className="block font-black uppercase tracking-widest text-[10px] italic">MISSING U</span>
                <span className="block text-[7px] text-white/30 tracking-wider">Alert Zxhan</span>
              </div>
            </button>
          )}
        </nav>

        <div className="mt-auto flex flex-col items-center lg:items-stretch gap-4 pt-8 border-t border-white/[0.03]">
          {/* Bell Icon for Shake - ONLY SCREEN SHAKE */}
          <button
            onClick={() => handleAction('shake')}
            className={`w-12 lg:w-full flex items-center justify-center lg:justify-start gap-4 p-3 lg:p-4 rounded-full bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-all group ${pulse === 'shake' ? 'scale-95 bg-white/10' : ''}`}
          >
            <Bell className={`w-5 h-5 text-white/60 group-hover:text-white transition-colors ${pulse === 'shake' ? 'animate-bounce' : ''}`} />
            <div className="hidden lg:block text-left min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-widest text-white/80">Shake</span>
              <span className="block text-[8px] text-white/30 tracking-wider">Vibrate Screen</span>
            </div>
          </button>

          {/* Profile & Logout Section */}
          <div className="flex flex-col lg:flex-row items-center gap-3 lg:gap-4 lg:p-4 lg:bg-white/[0.02] lg:rounded-3xl lg:border lg:border-white/[0.05] group shrink-0">
            <div className="w-12 h-12 lg:w-9 lg:h-9 rounded-full border border-white/10 flex items-center justify-center text-lg bg-black shrink-0 overflow-hidden">
              <img
                src={user === 'Anvi' ? 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.30.06%20AM.jpeg' : 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.32.21%20AM.jpeg'}
                alt={user}
                className="w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity"
              />
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <p className="text-xs font-black italic truncate leading-none uppercase tracking-tighter opacity-40 group-hover:opacity-80 transition-opacity">{user}</p>
            </div>
            <button
              onClick={onLogout}
              className="w-12 h-12 lg:w-auto lg:h-auto flex items-center justify-center rounded-full bg-white/[0.03] lg:bg-transparent border border-white/10 lg:border-none lg:p-2 text-white/10 hover:text-red-500/60 transition-colors shrink-0"
            >
              <LogOut className="w-5 h-5 lg:w-4 lg:h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Dock */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[85px] bg-[#000000] border-t border-white/[0.05] flex justify-around items-center px-4 z-[250] pb-4">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={`flex flex-col items-center gap-1.5 transition-all flex-1 ${active === item.id ? 'text-white' : 'text-white/20'
              }`}
          >
            <item.icon className={`w-5 h-5 shrink-0 ${active === item.id ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
            <span className="text-[7px] font-black uppercase tracking-[0.2em] italic leading-none">{item.label}</span>
          </button>
        ))}

        {/* Heart Icon - MISSING U (After Arcade) */}
        {user === 'Anvi' && (
          <button
            onClick={() => handleAction('missyou')}
            className={`flex flex-col items-center gap-1.5 flex-1 transition-all ${pulse === 'missyou' ? 'text-white' : 'text-white/20'}`}
          >
            <Heart className={`w-5 h-5 ${pulse === 'missyou' ? 'animate-pulse fill-white' : ''}`} />
            <span className="text-[7px] font-black uppercase tracking-[0.2em] italic leading-none">LOVE</span>
          </button>
        )}

        {/* Mobile Bell Button - SHAKE ONLY */}
        <button
          onClick={() => handleAction('shake')}
          className={`flex flex-col items-center gap-1.5 flex-1 transition-all ${pulse === 'shake' ? 'text-white' : 'text-white/20'}`}
        >
          <Bell className={`w-5 h-5 ${pulse === 'shake' ? 'animate-bounce text-white' : ''}`} />
          <span className="text-[7px] font-black uppercase tracking-[0.2em] italic leading-none">SHAKE</span>
        </button>
      </nav>

    </>
  );
};
