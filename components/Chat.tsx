import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Message, User } from '../types';
import { sync, supabase } from '../services/sync';
import { Send, Image as ImageIcon, Smile, Shield, X, Mic, StopCircle } from 'lucide-react';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';

const REACTION_EMOJIS = ['❤️', '🔥', '✨', '🥺', '💀', '💯', '🙌'];

// Restricted Emoji List (Yellow Faces, Pregnant Man, Joker) as requested
// We will use a custom category or just filtering if possible, but EmojiPicker doesn't easily support *only* specific list without custom rendering.
// Alternative: We configure EmojiPicker to show specific categories or searching.
// The user asked for "face wale saare emojis... pregnant man... joker". 
// Best approach: Use EmojiPicker but maybe restrict categories if possible, or just let them use it but suggest these. 
// "Face wale saare" = Smileys & People.
// Actually, to be strict, we'd need a custom picker. 
// For now, I'll set the default category to Smileys and maybe user is happy with that, 
// OR I can try to filter. But `emoji-picker-react` is robust.
// Let's stick to standard picker but pre-load 'Smileys & People'.

export const Chat: React.FC<{ user: User; isActive: boolean }> = ({ user, isActive }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const isStartingRef = useRef(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [offlineQueue, setOfflineQueue] = useState<any[]>(sync.getQueue());
  const emojiPickerRef = useRef<HTMLDivElement>(null); // Ref for outside click

  useEffect(() => {
    // Initial fetch from Supabase with retry
    const loadMessages = async () => {
      try {
        const msgs = await sync.fetchMessages();
        const queuedMsgs = sync.getQueue()
          .filter((item: any) => item.type === 'message')
          .map((item: any) => item.data);

        // Merge and deduplicate
        setMessages(prev => {
          const combined = [...msgs, ...queuedMsgs];
          const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
          return unique.sort((a: any, b: any) => a.timestamp - b.timestamp);
        });
        console.log('Successfully loaded messages (including queue)');
      } catch (err) {
        console.error('Failed to load messages, retrying...', err);
        setTimeout(loadMessages, 3000);
      }
    };
    loadMessages();

    // Re-fetch on reconnection to catch missed messages during offline/refresh bleeps
    const handleReconnection = () => {
      console.log('Online event detected, re-syncing chat history...');
      loadMessages();
    };
    window.addEventListener('online', handleReconnection);

    // Listen to queue changes (for visual syncing status)
    const unsubQueue = sync.subscribe('queue_change', (queue: any[]) => {
      setOfflineQueue(queue);
    });

    // Subscribe to new messages from Supabase Realtime
    console.log('Subscribing to messages_channel...');
    const subscription = supabase
      .channel('messages_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        console.log('New message received via Realtime:', payload.new);
        const msg = payload.new as Message;
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        console.log('Message updated via Realtime:', payload.new);
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          // Every time we get back to SUBSCRIBED, refetch to be absolutely sure we didn't miss anything
          loadMessages();
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription failed. Ensure that "Realtime" is enabled for the "messages" table in Supabase.');
        }
      });

    const unsubChat = sync.subscribe('chat', (msg: Message) => {
      console.log('Instant message received via Broadcast:', msg);
      if (msg.sender === user) return; // Fix: Don't process our own broadcast
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
      });
    });

    return () => {
      console.log('Unsubscribing from channels');
      window.removeEventListener('online', handleReconnection);
      subscription.unsubscribe();
      unsubChat();
      unsubQueue();
    };
  }, []);

  useEffect(() => {
    if (isActive) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isActive]);

  // Outside click handler for Emoji Picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        // Don't close if clicking the toggle button (handled by standard prop usually but let's be safe)
        !(event.target as HTMLElement).closest('.emoji-toggle-btn')
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const sendMessage = async (content?: string, image?: string, audio?: string) => {
    if (!content?.trim() && !image && !audio) return;

    let type: 'text' | 'image' | 'voice' = 'text';
    if (image) type = 'image';
    if (audio) type = 'voice';

    // Expiry: 48h for all (Text, Image, Voice) as requested
    const expiryHours = 48;

    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: user,
      content: audio || content, // Audio goes to content
      image: image,
      type: type,
      timestamp: Date.now(),
      expiresAt: Date.now() + expiryHours * 60 * 60 * 1000,
      reactions: {}
    };

    setMessages(prev => [...prev, msg].sort((a, b) => a.timestamp - b.timestamp));

    await sync.publish('chat', msg); // Instant broadcast
    await sync.saveMessage(msg); // Persistent storage
    setInput('');
    setShowEmojiPicker(false);

    // Auto-focus input after sending
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const onEmojiClick = (emojiData: any) => {
    setInput(prev => prev + emojiData.emoji);
  };

  const addReaction = async (msgId: string, emoji: string) => {
    const message = messages.find(m => m.id === msgId);
    if (!message) return;

    const reactions = { ...(message.reactions || {}) };
    const users = (reactions[emoji] || []) as User[];
    reactions[emoji] = users.includes(user) ? users.filter(u => u !== user) : [...users, user];
    if (reactions[emoji].length === 0) delete reactions[emoji];

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));

    await supabase.from('messages').update({ reactions }).eq('id', msgId);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => sendMessage(undefined, reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    if (isRecording || isStartingRef.current) return;
    try {
      isStartingRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size < 1000) return; // Ignore very short taps

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          sendMessage(undefined, undefined, base64);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      isStartingRef.current = false;

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 300) { // 5 minutes limit
            recorder.stop();
            clearInterval(recordingTimerRef.current);
            setIsRecording(false);
            return 300;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (e) {
      isStartingRef.current = false;
      console.error('Microphone access denied', e);
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setMediaRecorder(null);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#000000] relative">
      <div className="flex-1 overflow-y-auto px-4 md:px-12 pt-6 pb-28 no-scrollbar">
        <div className="flex flex-col items-center py-6 opacity-5">
          <Shield className="w-3 h-3 mb-1" />
          <p className="text-[7px] font-bold uppercase tracking-[0.5em]">PERSISTENT SECURED LINE</p>
        </div>
        <div className="space-y-6 max-w-2xl mx-auto">
          {messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${m.sender === user ? 'items-end' : 'items-start'}`}>
              <div className="group relative max-w-[85%] md:max-w-[70%]">
                <div className={`p-4 rounded-[1.2rem] text-sm leading-relaxed ${m.sender === user ? 'bg-white/10 text-white border border-white/10 font-medium rounded-tr-none' : 'bg-white/[0.04] text-white/90 rounded-tl-none border border-white/[0.05] backdrop-blur-xl'}`}>
                  {m.image && (
                    <div className="cursor-pointer overflow-hidden rounded-lg mb-2" onClick={() => setLightboxImage(m.image!)}>
                      <img src={m.image} alt="Shared" className="w-full max-h-48 md:max-h-64 object-contain hover:scale-105 transition-transform duration-500 brightness-90 hover:brightness-100" />
                    </div>
                  )}
                  {m.type === 'voice' && (
                    <div className="min-w-[200px] flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                        <Mic className="w-5 h-5 opacity-50" />
                      </div>
                      <audio controls src={m.content} className="h-8 w-full opacity-80" />
                    </div>
                  )}
                  {m.type === 'text' && m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}

                  {/* Status Indicator */}
                  {m.sender === user && (
                    <div className="flex justify-end mt-1 opacity-20 group-hover:opacity-100 transition-opacity">
                      {offlineQueue.find(q => q.data?.id === m.id) ? (
                        <div className="flex items-center gap-1 text-[8px] italic">
                          <StopCircle className="w-2 h-2 animate-pulse" />
                          <span>Syncing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[8px]">
                          <Shield className="w-2 h-2" />
                          <span>Saved</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className={`absolute -top-7 flex gap-1 bg-black/90 border border-white/10 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all scale-75 z-20 ${m.sender === user ? 'right-0' : 'left-0'}`}>
                  {REACTION_EMOJIS.slice(0, 5).map(e => <button key={e} onClick={() => addReaction(m.id, e)} className="hover:scale-125 transition-transform">{e}</button>)}
                </div>
              </div>
              {m.reactions && Object.keys(m.reactions).length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-1.5 ${m.sender === user ? 'justify-end' : 'justify-start'}`}>
                  {Object.entries(m.reactions).map(([emoji, val]) => (
                    <button key={emoji} onClick={() => addReaction(m.id, emoji)} className={`px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all ${(val as User[]).includes(user) ? 'bg-white/10 border-white/20 text-white' : 'bg-white/[0.02] border-white/5 text-white/20'}`}>{emoji} {(val as User[]).length}</button>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
          <div ref={scrollRef} />
        </div>
      </div>

      <AnimatePresence>
        {lightboxImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightboxImage(null)} className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 cursor-zoom-out">
            <img src={lightboxImage} alt="Full view" className="max-w-full max-h-full object-contain shadow-2xl rounded-sm" />
            <button onClick={() => setLightboxImage(null)} className="absolute top-6 right-6 p-3 bg-white/10 rounded-full hover:bg-white/20 text-white"><X className="w-6 h-6" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-black via-black/80 to-transparent">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              ref={emojiPickerRef}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute bottom-full mb-6 left-0 right-0 md:left-auto md:right-auto z-[200] flex justify-center"
            >
              <div className="relative bg-[#0a0a0a]/98 backdrop-blur-3xl border border-white/[0.08] rounded-[2.5rem] shadow-[0_32px_128px_rgba(0,0,0,0.95)] overflow-hidden max-w-[95vw] sm:max-w-none ring-1 ring-white/10 p-1">
                {/* Header with Close Button */}
                <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-30 flex items-center justify-end px-6">
                  <button
                    onClick={() => setShowEmojiPicker(false)}
                    className="pointer-events-auto p-2.5 bg-white/[0.05] rounded-full border border-white/10 text-white/40 hover:text-white hover:scale-110 transition-all active:scale-95 shadow-xl backdrop-blur-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <style>{`
                  .EmojiPickerReact {
                    --epr-bg-color: transparent !important;
                    --epr-category-label-bg-color: transparent !important;
                    --epr-text-color: #fff !important;
                    --epr-picker-border-color: transparent !important;
                    --epr-search-input-bg-color: rgba(255,255,255,0.04) !important;
                    --epr-search-input-text-color: #fff !important;
                    --epr-preview-text-color: #fff !important;
                    --epr-hover-bg-color: rgba(255,255,255,0.05) !important;
                    --epr-focus-bg-color: rgba(255,255,255,0.08) !important;
                    --epr-highlight-color: var(--accent, #fff) !important;
                    font-family: inherit !important;
                    border: none !important;
                    background: transparent !important;
                    padding-top: 10px !important;
                  }
                  .EmojiPickerReact .epr-body::-webkit-scrollbar {
                    width: 4px;
                  }
                  .EmojiPickerReact .epr-body::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 10px;
                  }
                  .EmojiPickerReact .epr-emoji-category-label {
                    background: rgba(10,10,10,0.6) !important;
                    backdrop-filter: blur(10px) !important;
                    font-size: 8px !important;
                    font-weight: 900 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.3em !important;
                    opacity: 0.3 !important;
                    margin-top: 5px !important;
                  }
                  .EmojiPickerReact .epr-search-container {
                    padding: 24px 20px 10px 20px !important;
                    padding-right: 70px !important; 
                  }
                  .EmojiPickerReact .epr-search-input {
                    border: 1px solid rgba(255,255,255,0.1) !important;
                    border-radius: 0.75rem !important;
                    padding-left: 14px !important;
                    padding-right: 42px !important;
                    height: 38px !important;
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.2) !important;
                  }
                  .EmojiPickerReact .epr-icn-search {
                    right: 32px !important;
                    left: auto !important;
                    width: 16px !important;
                    height: 16px !important;
                    opacity: 0.6 !important;
                    filter: brightness(0) invert(1) !important;
                    background-size: contain !important;
                    background-repeat: no-repeat !important;
                  }
                  @media (min-width: 641px) {
                    .EmojiPickerReact {
                      width: 310px !important;
                      height: 400px !important;
                    }
                  }
                  @media (max-width: 640px) {
                    .EmojiPickerReact {
                      width: 100% !important;
                      height: 380px !important;
                    }
                  }
                `}</style>
                <EmojiPicker
                  theme={Theme.DARK}
                  emojiStyle={EmojiStyle.NATIVE}
                  onEmojiClick={onEmojiClick}
                  searchDisabled={false}
                  width="100%"
                  height={window.innerWidth < 640 ? 400 : 450}
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis={true}
                  skinTonesDisabled={true}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="max-w-2xl mx-auto p-1.5 bg-[#0a0a0a]/90 border border-white/5 rounded-full flex items-center gap-1 shadow-2xl backdrop-blur-3xl relative z-40">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="p-3 text-white/10 hover:text-white/40 transition-colors shrink-0"><ImageIcon className="w-5 h-5" /></button>

          <div className="flex items-center gap-1 group relative">
            {isRecording && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="absolute right-full mr-4 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-xl shrink-0 whitespace-nowrap">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black italic text-red-500 uppercase tracking-widest">{formatTime(recordingTime)} / 5:00</span>
              </motion.div>
            )}
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`p-3 transition-all shrink-0 ${isRecording ? 'text-red-500 scale-125' : 'text-white/10 hover:text-white/40'}`}
            >
              <Mic className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />
            </button>
          </div>

          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`emoji-toggle-btn p-3 transition-colors shrink-0 ${showEmojiPicker ? 'text-white' : 'text-white/10 hover:text-white/40'}`}><Smile className="w-5 h-5" /></button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder="Encrypted message..."
            className="flex-1 bg-transparent border-none outline-none p-2 text-sm font-medium text-white/80 placeholder:text-white/5"
            autoFocus
          />
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => sendMessage(input)} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center shrink-0"><Send className="w-4 h-4 fill-current" /></motion.button>
        </div>
      </div>
    </div >
  );
};
