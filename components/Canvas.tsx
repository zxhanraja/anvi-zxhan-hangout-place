
import React, { useRef, useEffect, useState } from 'react';
import { sync } from '../services/sync';
import { User } from '../types';
import { Palette, Eraser, Trash2, Smile, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STAMP_EMOJIS = ['❤️', '🔥', '✨', '👑', '💀', '💯', '💅🏻', '🦄', '🎀', '⚡️'];

export const Canvas: React.FC<{ user: User }> = ({ user }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState(5);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'stamp' | 'brush'>('pen');
  const [activeEmoji, setActiveEmoji] = useState('❤️');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const PRESET_COLORS = [
    '#ffffff', // Ghost
    '#ff4d4d', // Ruby
    '#4d79ff', // Sapphire
    '#4dff88', // Emerald
    '#ffcc00', // Gold
    '#ff80ff', // Pink
    '#80ffff', // Cyan
    '#ff8533', // Orange
  ];

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const drawAction = (action: any) => {
      const width = canvas.width;
      const height = canvas.height;

      if (action.type === 'draw') {
        ctx.beginPath();
        ctx.strokeStyle = action.color || action.data?.color;
        ctx.lineWidth = action.size || action.data?.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = (action.tool || action.data?.tool) === 'brush' ? 0.2 : 1.0;
        ctx.moveTo((action.lastX || action.data?.lastX) * width, (action.lastY || action.data?.lastY) * height);
        ctx.lineTo((action.x || action.data?.x) * width, (action.y || action.data?.y) * height);
        ctx.stroke();
      } else if (action.type === 'stamp') {
        const size = action.size || action.data?.size;
        const emoji = action.emoji || action.data?.emoji;
        ctx.font = `${size * 4}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, (action.x || action.data?.x) * width, (action.y || action.data?.y) * height);
      } else if (action.type === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const resize = () => {
      if (!containerRef.current) return;
      const data = canvas.toDataURL();
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = data;
    };

    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };

    resize();
    window.addEventListener('resize', handleResize);

    // Initial fetch of strokes
    sync.fetchStrokes().then(strokes => {
      strokes.forEach(s => drawAction(s));
    });

    const unsubDrawing = sync.subscribe('drawing', (action: any) => {
      if (action.user === user) return;
      drawAction(action);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubDrawing();
    };
  }, [user]);

  const lastPos = useRef({ x: 0, y: 0 });
  const lastSyncedPos = useRef({ x: 0, y: 0 });
  const lastSyncTime = useRef(0);

  const getPos = (e: any) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    return { x, y };
  };

  const start = (e: any) => {
    const { x, y } = getPos(e);
    const width = canvasRef.current!.width;
    const height = canvasRef.current!.height;

    if (tool === 'stamp') {
      const ctx = canvasRef.current!.getContext('2d')!;
      ctx.font = `${size * 4}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(activeEmoji, x, y);
      const payload = { type: 'stamp', user, x: x / width, y: y / height, emoji: activeEmoji, size };
      sync.publish('drawing', payload);
      sync.saveStroke('stamp', user, payload);
      return;
    }
    lastPos.current = { x, y };
    lastSyncedPos.current = { x, y }; // Initialize sync anchor
    setIsDrawing(true);
  };

  const move = (e: any) => {
    if (!isDrawing || tool === 'stamp') return;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;

    // Smooth drawing settings
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.strokeStyle = '#000000';
      ctx.globalAlpha = 1.0;
    } else if (tool === 'brush') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.2; // Soft brush effect
    } else {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1.0;
    }

    ctx.beginPath();
    ctx.lineWidth = size;
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    const now = Date.now();
    if (now - lastSyncTime.current > 12) { // Smoother: ~80fps throttling
      const width = canvasRef.current!.width;
      const height = canvasRef.current!.height;

      const payload = {
        type: 'draw',
        user,
        x: x / width,
        y: y / height,
        lastX: lastSyncedPos.current.x / width,
        lastY: lastSyncedPos.current.y / height,
        color: tool === 'eraser' ? '#000000' : color,
        size,
        tool
      };
      sync.publish('drawing', payload);
      sync.saveStroke('draw', user, payload);
      lastSyncTime.current = now;
      lastSyncedPos.current = { x, y }; // Only update anchor after sync
    }
    lastPos.current = { x, y };
  };

  const stop = () => setIsDrawing(false);

  return (
    <div className="h-full flex flex-col p-2 md:p-6 bg-[#050505] gap-2 md:gap-4 overflow-hidden">
      {/* Responsive Toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full max-w-lg px-4 pointer-events-none">

        {/* Color Palette Popover */}
        <AnimatePresence>
          {showColorPicker && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="pointer-events-auto flex flex-wrap justify-center gap-3 p-4 bg-black/90 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl max-w-[280px]"
            >
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setShowColorPicker(false); if (tool === 'eraser') setTool('pen'); }}
                  className={`w-10 h-10 rounded-full border-2 transition-all hover:scale-110 active:scale-90 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <div className="w-full h-px bg-white/5 my-1" />
              <div className="relative w-full h-10 rounded-xl overflow-hidden border border-white/10 group">
                <input
                  type="color"
                  value={color}
                  onChange={e => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }}
                  className="absolute inset-0 w-full h-full scale-[3] cursor-pointer bg-transparent"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[8px] font-black tracking-widest uppercase opacity-40 group-hover:opacity-100 transition-opacity">Custom Color</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stamp Palette */}
        <AnimatePresence>
          {tool === 'stamp' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="pointer-events-auto flex gap-3 overflow-x-auto p-4 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl no-scrollbar max-w-full">
              {STAMP_EMOJIS.map(e => (
                <button key={e} onClick={() => setActiveEmoji(e)} className={`text-2xl shrink-0 w-12 h-12 flex items-center justify-center transition-all rounded-xl ${activeEmoji === e ? 'bg-white/20 border border-white/20 scale-110' : 'opacity-40 hover:opacity-100 hover:bg-white/5'}`}>{e}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Professional Dock */}
        <div className="pointer-events-auto flex items-center gap-2 md:gap-4 bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/10 p-2.5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={`w-11 h-11 rounded-full border-2 transition-all flex items-center justify-center overflow-hidden shrink-0 ${showColorPicker ? 'border-white scale-110 ring-4 ring-white/10' : 'border-white/20 active:scale-95'}`}
            style={{ backgroundColor: color }}
          >
            <Palette className={`w-5 h-5 ${color === '#ffffff' ? 'text-black' : 'text-white'} mix-blend-difference opacity-50`} />
          </button>

          <div className="w-px h-8 bg-white/10 mx-1" />

          <div className="flex items-center gap-1">
            {[
              { id: 'pen', icon: Palette, label: 'Pen' },
              { id: 'brush', icon: Layers, label: 'Brush' },
              { id: 'eraser', icon: Eraser, label: 'Eraser' },
              { id: 'stamp', icon: Smile, label: 'Stamp' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => { setTool(t.id as any); setShowColorPicker(false); }}
                className={`p-3 rounded-full transition-all group relative ${tool === t.id ? 'bg-white text-black shadow-xl scale-105' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
              >
                <t.icon className="w-5 h-5" />
                <span className={`absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/90 border border-white/10 rounded text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-white/10 mx-1" />

          <div className="flex items-center gap-3 px-2">
            <div className="hidden md:block w-1 h-8 bg-white/5 rounded-full overflow-hidden">
              <motion.div animate={{ height: `${(size / 50) * 100}%` }} className="w-full bg-white origin-bottom" />
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={size}
              onChange={e => setSize(parseInt(e.target.value))}
              className="w-20 md:w-32 accent-white h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>

          <button onClick={() => {
            canvasRef.current!.getContext('2d')!.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
            sync.publish('drawing', { type: 'clear', user });
            sync.saveStroke('clear', user, {});
          }} className="p-3 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all shrink-0"><Trash2 className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="flex-1 rounded-[1.5rem] md:rounded-[3.5rem] overflow-hidden border-2 border-white/5 bg-black cursor-crosshair relative shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={stop}
          className="w-full h-full touch-none"
        />
        <div className="absolute top-4 right-4 pointer-events-none opacity-5">
          <Layers className="w-12 h-12 md:w-16 md:h-16" />
        </div>
      </div>
    </div>
  );
};
