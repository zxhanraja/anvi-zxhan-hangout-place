
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Message } from './types';
import { sync, supabase } from './services/sync';
import { Chat } from './components/Chat';
import { Canvas } from './components/Canvas';
import { MusicSyncBar } from './components/MusicSyncBar';
import { Games } from './components/Games';
import { Sidebar } from './components/Sidebar';
import { Heart, ShieldCheck } from 'lucide-react';

const IMAGES = {
  Anvi: 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.30.06%20AM.jpeg',
  Zxhan: 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.32.21%20AM.jpeg',
  // Optimized versions
  Anvi_Thumb: 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.30.06%20AM.jpeg?tr=w-100,h-100,f-auto',
  Zxhan_Thumb: 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.32.21%20AM.jpeg?tr=w-100,h-100,f-auto',
  Anvi_Login: 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.30.06%20AM.jpeg?tr=w-400,h-600,f-auto',
  Zxhan_Login: 'https://ik.imagekit.io/ioktbcewp/WhatsApp%20Image%202026-02-13%20at%2010.32.21%20AM.jpeg?tr=w-400,h-600,f-auto'
};

const UserAvatar: React.FC<{ user: User }> = ({ user }) => {
  const src = user === 'Anvi' ? IMAGES.Anvi_Thumb : IMAGES.Zxhan_Thumb;

  return (
    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-500">
      <img src={src} alt={user} className="w-full h-full object-cover" />
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [accent, setAccent] = useState(() => localStorage.getItem('theme_accent') || '#ffffff');
  const [presence, setPresence] = useState<any>({});

  const [isShaking, setIsShaking] = useState(false);

  // Auto-login disabled as per user request to always show entry gate
  // useEffect(() => {
  //   const saved = localStorage.getItem('user_id') as User;
  //   if (saved) setUser(saved);
  // }, []);

  useEffect(() => {
    const unsubTheme = sync.subscribe('theme', (data: any) => {
      setAccent(data.accent);
      localStorage.setItem('theme_accent', data.accent);
    });

    const unsubPresence = sync.subscribe('presence', (data: any) => {
      setPresence((prev: any) => ({ ...prev, [data.user]: data }));
    });

    const unsubMissYou = sync.subscribe('missyou', (data: any) => {
      if (data.sender !== user) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 800);
      }
    });

    // Initial presence fetch
    supabase.from('presence').select('*').then(({ data }) => {
      if (data) {
        const p: any = {};
        data.forEach((item: any) => {
          p[item.user_id] = { user: item.user_id, isOnline: item.is_online };
        });
        setPresence(p);
      }
    });

    // Heartbeat mechanism
    let heartbeat: any;
    if (user) {
      sync.updatePresence(user, true); // Initial online status

      heartbeat = setInterval(() => {
        sync.updatePresence(user, true);
      }, 30000); // 30 seconds heartbeat

      // Handle visibility changes
      const handleVisibility = () => {
        if (document.hidden) {
          sync.updatePresence(user, false);
        } else {
          sync.updatePresence(user, true);
        }
      };

      // Handle window close
      const handleUnload = () => {
        sync.updatePresence(user, false);
      };

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('beforeunload', handleUnload);

      return () => {
        unsubTheme();
        unsubPresence();
        unsubMissYou();
        clearInterval(heartbeat);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('beforeunload', handleUnload);
      };
    }

    return () => {
      unsubTheme();
      unsubPresence();
      unsubMissYou();
    };
  }, [user]);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('user_id', u);
  };

  const handleMissYou = async (type: 'shake' | 'missyou') => {
    if (!user) return;
    const recipient = user === 'Anvi' ? 'Zxhan' : 'Anvi';

    // Heartbeat/Cinematic broadcast
    sync.publish('missyou', { sender: user, timestamp: Date.now(), type });

    if (type === 'missyou') {
      // Persistent Notification for Anvi's request
      const notificationMsg = user === 'Anvi' ? 'Anvi was missing u' : `${user} was missing u`;
      await sync.sendNotification(user, recipient, notificationMsg);

      // Web3Forms Email Trigger (Keeping it as is but it's part of the persistent alert)
      try {
        await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_key: 'YOUR-WEB3FORMS-KEY-HERE', // User should replace this
            subject: user === 'Anvi' ? 'Anvi is missing you!' : `${user} misses you!`,
            message: user === 'Anvi'
              ? `Hey Zxhan, Anvi just sent you a signal from your Private Hangout. She's thinking about you!`
              : `Hey ${recipient}, ${user} just sent you a signal from your Private Hangout. Go check it out!`,
            from_name: 'Hangout Bot'
          })
        });
      } catch (e) {
        console.error('Failed to send email notification');
      }
    }
  };

  const handleSetAccent = (color: string) => {
    setAccent(color);
    sync.publish('theme', { accent: color });
  };

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const otherUser = user === 'Anvi' ? 'Zxhan' : 'Anvi';
  const isOtherOnline = presence[otherUser]?.isOnline;

  const shakeVariants = {
    shake: {
      x: [0, -15, 15, -15, 15, -10, 10, -5, 5, 0],
      transition: { duration: 0.4, ease: "easeInOut" }
    },
    idle: { x: 0 }
  };

  return (
    <motion.div
      variants={shakeVariants}
      animate={isShaking ? 'shake' : 'idle'}
      className="h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden text-white bg-[#000000] select-none fixed inset-0"
      style={{ '--accent': accent } as any}
    >
      <Sidebar active={activeTab} setActive={setActiveTab} user={user} onLogout={() => { setUser(null); localStorage.removeItem('user_id'); }} accent={accent} setAccent={handleSetAccent} onMissYou={handleMissYou} />
      <main className="flex-1 relative flex flex-col bg-[#000000] min-w-0 h-full overflow-hidden">
        <header className="px-4 md:px-10 py-3 md:py-4 border-b border-white/[0.03] flex justify-between items-center z-50 bg-[#000000]/80 backdrop-blur-2xl shrink-0">
          <h2 className="font-display text-xs md:text-lg font-black italic uppercase tracking-[0.2em] opacity-80 truncate mr-4">{activeTab}</h2>
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[7px] md:text-[10px] font-bold uppercase tracking-widest opacity-20 leading-none">{otherUser}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`w-1 h-1 rounded-full ${isOtherOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-white/5'}`} />
                <span className={`text-[7px] md:text-[9px] font-black uppercase tracking-tighter ${isOtherOnline ? 'text-green-500/60' : 'text-white/10'}`}>{isOtherOnline ? 'Active' : 'Away'}</span>
              </div>
            </div>
            <div className="w-7 h-7 md:w-10 md:h-10 rounded-full border border-white/[0.05] flex items-center justify-center bg-white/[0.02] overflow-hidden">
              <img
                src={otherUser === 'Anvi' ? IMAGES.Anvi_Thumb : IMAGES.Zxhan_Thumb}
                alt={otherUser}
                className="w-full h-full object-cover grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden h-full">
          {/* ... (Tab Content) ... */}
          <motion.div
            initial={false}
            animate={{ opacity: activeTab === 'chat' ? 1 : 0, pointerEvents: activeTab === 'chat' ? 'auto' : 'none' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 h-full w-full overflow-hidden"
            style={{ zIndex: activeTab === 'chat' ? 10 : 0 }}
          >
            <Chat user={user} isActive={activeTab === 'chat'} />
          </motion.div>

          <AnimatePresence mode="popLayout">
            {activeTab === 'drawing' && (
              <motion.div key="drawing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 h-full w-full overflow-hidden z-20 bg-[#000000]">
                <Canvas user={user} />
              </motion.div>
            )}
            {activeTab === 'games' && (
              <motion.div key="games" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 h-full w-full overflow-hidden z-20 bg-[#000000]">
                <Games user={user} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        <MusicSyncBar user={user} />
        <div className="md:hidden h-[75px] md:h-[85px] shrink-0 pointer-events-none" />
      </main>
    </motion.div>

  );
};

const LoginScreen: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-[#000000] p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]" />

      <div className="flex flex-col md:flex-row gap-8 md:gap-12 z-10 w-full max-w-4xl justify-center items-center">
        {/* Site Header Content */}
        <div className="absolute top-12 left-0 right-0 text-center flex flex-col items-center gap-2">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            <h1 className="font-display text-5xl md:text-7xl font-black italic uppercase tracking-[-0.05em] text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              Private Hangout
            </h1>
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="h-[1px] w-12 bg-white/20" />
              <p className="font-display text-[10px] md:text-xs font-bold uppercase tracking-[0.8em] text-white/50 translate-x-[0.4em]">
                Anvi & Zxhan
              </p>
              <div className="h-[1px] w-12 bg-white/20" />
            </div>
          </motion.div>
        </div>

        <LoginCard
          user="Anvi"
          img={IMAGES.Anvi_Login}
          onClick={() => onLogin('Anvi')}
          accent="#a855f7"
        />
        <LoginCard
          user="Zxhan"
          img={IMAGES.Zxhan_Login}
          onClick={() => onLogin('Zxhan')}
          accent="#3b82f6"
        />
      </div>

      <div className="absolute bottom-12 left-0 right-0 text-center pointer-events-none">
        <p className="font-display font-black text-[#ffffff]/20 tracking-[0.5em] text-[10px] uppercase">Restricted Access // Private Network</p>
      </div>
    </div>
  );
};

// ... Login Screen ...

const LoginCard: React.FC<{ user: User; img: string; onClick: () => void; accent: string }> = ({ user, img, onClick, accent }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover="hover"
      className="relative w-60 md:w-64 aspect-[3/4.5] rounded-[2rem] bg-[#0a0a0a] border border-white/10 cursor-pointer group overflow-hidden shadow-2xl"
      onClick={onClick}
    >
      {/* Background Image - B&W Default, Color on Hover */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700 ease-out"
        style={{ backgroundImage: `url(${img})` }}
        variants={{ hover: { scale: 1.1 } }}
        transition={{ duration: 0.7 }}
      />

      {/* Gradient Overlay for Text Visibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-90 group-hover:opacity-60 transition-all duration-500" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 z-20">
        <motion.div variants={{ hover: { y: -5 } }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          <h3 className="font-display text-3xl font-black italic uppercase tracking-tighter text-white mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{user}</h3>
          <div className="h-0.5 w-8 bg-white/50 mb-2 group-hover:w-full transition-all duration-500" />
          <p className="text-white/80 text-[9px] uppercase tracking-[0.2em] font-bold">Identity Confirmed</p>
        </motion.div>

        {/* Enter Button */}
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          variants={{ hover: { opacity: 1, height: 'auto', marginTop: 16 } }}
          className="overflow-hidden"
        >
          <div className="w-full py-3 rounded-lg bg-white text-black font-black uppercase italic tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors">
            <span>Access</span>
            <ShieldCheck className="w-3 h-3" />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default App;
