
import React, { useState, useEffect } from 'react';
import { sync } from '../services/sync';
import { User } from '../types';
import { LayoutGrid, Grid2X2, Skull, Flame, Zap, HelpCircle, Hand, Scissors, Square, User2, Dices } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const Games: React.FC<{ user: User }> = ({ user }) => {
  const [currentGame, setCurrentGame] = useState<'tictactoe' | 'connect4' | 'word' | 'truthordare' | 'reaction' | 'rps' | 'menu'>('menu');
  const [scores, setScores] = useState<Record<string, number>>({ Anvi: 0, Zxhan: 0 });
  const [winner, setWinner] = useState<{ name: User; msg: string } | null>(null);

  // States
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const [c4Board, setC4Board] = useState<(string | null)[][]>(Array(6).fill(null).map(() => Array(7).fill(null)));
  const [c4Turn, setC4Turn] = useState<User>('Anvi');
  const [wordState, setWordState] = useState({ word: '', guesses: [] as string[], setter: '' as User | '', status: 'setting' as 'setting' | 'guessing' | 'won' | 'lost' });
  const [wordInput, setWordInput] = useState('');
  const [tdActive, setTdActive] = useState<{ type: 'truth' | 'dare' | '', content: '' }>({ type: '', content: '' });
  const [reactionState, setReactionState] = useState({ status: 'waiting', startTime: 0, scores: {} as any });
  const [rpsState, setRpsState] = useState<Record<User, string | null>>({ Anvi: null, Zxhan: null });

  // TTT Infinity Logic: Track [ { index, symbol } ]
  const [tttHistory, setTttHistory] = useState<{ index: number; symbol: string }[]>([]);

  useEffect(() => {
    // Initial fetch
    sync.fetchScores().then(data => {
      const s: any = { Anvi: 0, Zxhan: 0 };
      data.forEach((item: any) => s[item.user_id] = item.score);
      setScores(s);
    });

    const unsub = sync.subscribe('game', (data: any) => {
      if (data.type === 'switch') { setCurrentGame(data.game); setWinner(null); }
      if (data.type === 'reset') { setWinner(null); }
      if (data.type === 'tictactoe') {
        setBoard(data.board);
        setXIsNext(data.xIsNext);
        setTttHistory(data.history || []);
        setCurrentGame('tictactoe');
      }
      if (data.type === 'connect4') { setC4Board(data.board); setC4Turn(data.turn); setCurrentGame('connect4'); }
      if (data.type === 'word') { setWordState(data.state); setCurrentGame('word'); }
      if (data.type === 'truthordare') { setTdActive(data.active); setCurrentGame('truthordare'); }
      if (data.type === 'reaction') { setReactionState(data.state); setCurrentGame('reaction'); }
      if (data.type === 'rps') { setRpsState(data.state); setCurrentGame('rps'); }
      if (data.type === 'win') { setWinner(data.winner); }
    });

    const unsubScores = sync.subscribe('scores', (data: any) => {
      setScores(prev => ({ ...prev, [data.user]: data.score }));
    });

    return () => {
      unsub();
      unsubScores();
    };
  }, []);

  const handleWin = (w: User) => {
    const winData = { name: w, msg: `${w} WON` };
    setWinner(winData);
    sync.updateScore(w, 1);
    sync.publish('game', { type: 'win', winner: winData });
  };

  const switchGame = (game: typeof currentGame) => {
    setCurrentGame(game);
    setWinner(null);
    sync.publish('game', { type: 'switch', game });
  };

  const resetGame = () => {
    setWinner(null);
    sync.publish('game', { type: 'reset' });
  };

  const handleTTTClick = (i: number) => {
    if (calculateTTTWinner(board) || board[i]) return;

    const symbol = user === 'Zxhan' ? 'X' : 'O';
    if ((xIsNext && symbol !== 'X') || (!xIsNext && symbol !== 'O')) return;

    const nextBoard = [...board];
    const nextHistory = [...tttHistory, { index: i, symbol }];

    // Infinity Rule: Max 3 marks per symbol
    const myMarks = nextHistory.filter(h => h.symbol === symbol);
    if (myMarks.length > 3) {
      const oldestMark = myMarks[0];
      nextBoard[oldestMark.index] = null;
      const filteredHistory = nextHistory.filter(h => !(h.index === oldestMark.index && h.symbol === oldestMark.symbol));
      nextBoard[i] = symbol;
      const finalHistory = filteredHistory;
      setBoard(nextBoard);
      setXIsNext(!xIsNext);
      setTttHistory(finalHistory);
      sync.publish('game', { type: 'tictactoe', board: nextBoard, xIsNext: !xIsNext, history: finalHistory });

      const winner = calculateTTTWinner(nextBoard);
      if (winner === 'X') handleWin('Zxhan');
      if (winner === 'O') handleWin('Anvi');
    } else {
      nextBoard[i] = symbol;
      setBoard(nextBoard);
      setXIsNext(!xIsNext);
      setTttHistory(nextHistory);
      sync.publish('game', { type: 'tictactoe', board: nextBoard, xIsNext: !xIsNext, history: nextHistory });

      const winner = calculateTTTWinner(nextBoard);
      if (winner === 'X') handleWin('Zxhan');
      if (winner === 'O') handleWin('Anvi');
    }
  };

  const handleC4Click = (colIndex: number) => {
    if (c4Turn !== user || winner) return;
    const nextBoard = c4Board.map(row => [...row]);
    let placedRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (!nextBoard[r][colIndex]) {
        nextBoard[r][colIndex] = user;
        placedRow = r;
        break;
      }
    }
    if (placedRow === -1) return;
    const nextTurn = user === 'Anvi' ? 'Zxhan' : 'Anvi';
    setC4Board(nextBoard);
    setC4Turn(nextTurn);
    sync.publish('game', { type: 'connect4', board: nextBoard, turn: nextTurn });

    if (checkC4Winner(nextBoard, placedRow, colIndex)) {
      handleWin(user);
    }
  };

  const handleRPS = (move: string) => {
    const nextRps = { ...rpsState, [user]: move };
    setRpsState(nextRps);
    sync.publish('game', { type: 'rps', state: nextRps });

    if (nextRps.Anvi && nextRps.Zxhan) {
      const res = getRPSResult(nextRps.Anvi, nextRps.Zxhan);
      if (res === 'ANVI WINS') {
        handleWin('Anvi');
      }
    }
  };

  const handleReactionClick = () => {
    if (reactionState.status !== 'ready' || winner) return;
    const time = Date.now() - reactionState.startTime;
    const nextState = { ...reactionState, status: 'finished', scores: { ...reactionState.scores, [user]: time } };
    setReactionState(nextState);
    sync.publish('game', { type: 'reaction', state: nextState });

    // Check if both played
    const other = user === 'Anvi' ? 'Zxhan' : 'Anvi';
    if (nextState.scores[other]) {
      const myTime = time;
      const otherTime = nextState.scores[other];
      if (myTime < otherTime) handleWin(user);
      else handleWin(other);
    }
  };

  const startReactionGame = () => {
    const delay = Math.random() * 2000 + 1000; // Harder: 1-3 seconds
    const state = { status: 'waiting', startTime: 0, scores: {} };
    setReactionState(state);
    sync.publish('game', { type: 'reaction', state });

    setTimeout(() => {
      const readyState = { status: 'ready', startTime: Date.now(), scores: {} };
      setReactionState(readyState);
      sync.publish('game', { type: 'reaction', state: readyState });
    }, delay);
  };

  const HANGMAN_WORDS = ['EPHEMERAL', 'QUINTESSENTIAL', 'RENAISSANCE', 'LABYRINTH', 'PARADIGM', 'JUXTAPOSITION', 'MELLIFLUOUS', 'SYCOPHANT', 'ZEITGEIST', 'OSCILLATE', 'CACOPHONY', 'QUixOTIC', 'NEBULOUS', 'PETRICHOR', 'HALCYON', 'SERENDIPITY'];

  const handleWordSet = () => {
    if (!wordInput.trim()) return;
    const state = { word: wordInput.toUpperCase().trim(), guesses: [], setter: user, status: 'guessing' as const };
    setWordState(state); setWordInput('');
    sync.publish('game', { type: 'word', state });
  };

  const handleGuess = (letter: string) => {
    if (wordState.setter === user || wordState.guesses.includes(letter)) return;
    const nextGuesses = [...wordState.guesses, letter];
    const uniqueWordLetters = new Set(wordState.word.split(''));
    const correctGuesses = nextGuesses.filter(l => uniqueWordLetters.has(l));
    const isWon = uniqueWordLetters.size === correctGuesses.length;
    const errors = nextGuesses.filter(l => !uniqueWordLetters.has(l)).length;
    const isLost = errors >= 7;
    const nextState = { ...wordState, guesses: nextGuesses, status: isWon ? 'won' as const : isLost ? 'lost' as const : 'guessing' as const };
    setWordState(nextState); sync.publish('game', { type: 'word', state: nextState });

    if (isWon && wordState.setter === 'Zxhan') handleWin('Anvi');
    if (isLost && wordState.setter === 'Anvi') handleWin('Anvi'); // Setter (Anvi) wins because Zxhan failed
  };

  if (currentGame === 'menu') {
    return (
      <div className="h-full flex flex-col items-center p-4 md:p-6 overflow-y-auto no-scrollbar bg-black">
        <header className="text-center mt-6 md:mt-12 mb-8 md:mb-16">
          <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter font-display">ARCADE</h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/10 mt-3">PRO COMPETITION</p>

          {/* Scoreboard - Responsive */}
          <div className="mt-8 flex items-center justify-center gap-4 md:gap-8">
            <div className="flex flex-col items-center p-4 md:p-6 bg-white/[0.02] border border-white/5 rounded-3xl min-w-[100px] md:min-w-[140px]">
              <span className="text-[10px] md:text-xs font-black tracking-widest opacity-30 italic">ANVI</span>
              <span className="text-3xl md:text-5xl font-display font-black text-[var(--accent)]">{scores.Anvi}</span>
            </div>
            <div className="h-10 w-[1px] bg-white/5" />
            <div className="flex flex-col items-center p-4 md:p-6 bg-white/[0.02] border border-white/5 rounded-3xl min-w-[100px] md:min-w-[140px]">
              <span className="text-[10px] md:text-xs font-black tracking-widest opacity-30 italic">ZXHAN</span>
              <span className="text-3xl md:text-5xl font-display font-black opacity-40">{scores.Zxhan}</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 w-full max-w-5xl pb-32">
          {[
            { id: 'tictactoe', icon: LayoutGrid, name: 'INFINITY', desc: 'TACTICAL TTT' },
            { id: 'connect4', icon: Grid2X2, name: 'GRAVITY', desc: 'CONNECT 4' },
            { id: 'word', icon: Skull, name: 'HANGMAN', desc: 'WORD DUEL' },
            { id: 'rps', icon: Hand, name: 'CLASH', desc: 'LIZARD SPOCK' },
            { id: 'reaction', icon: Zap, name: 'BLITZ', desc: 'REACTION' },
            { id: 'truthordare', icon: Flame, name: 'FLAME', desc: 'T OR D' },
          ].map((game) => (
            <motion.button key={game.id} whileHover={{ y: -5, scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => switchGame(game.id as any)} className="p-6 md:p-8 bg-white/[0.03] border border-white/[0.06] rounded-[2rem] md:rounded-[2.5rem] hover:bg-white hover:text-black transition-all group flex items-center gap-4 md:gap-6 text-left shadow-2xl">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-white/5 group-hover:bg-black/5 flex items-center justify-center shrink-0 transition-colors text-white group-hover:text-black">
                <game.icon className="w-6 h-6 md:w-8 md:h-8 shrink-0" />
              </div>
              <div className="min-w-0">
                <span className="block text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-none text-white group-hover:text-black">{game.name}</span>
                <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.2em] opacity-20 group-hover:opacity-40 mt-1 text-white group-hover:text-black">{game.desc}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center p-4 md:p-6 bg-black relative overflow-y-auto no-scrollbar">
      <button onClick={() => setCurrentGame('menu')} className="fixed top-4 left-4 md:top-8 md:left-8 px-4 md:px-5 py-2 md:py-2.5 bg-white text-black rounded-full font-black uppercase text-[8px] md:text-[10px] tracking-widest z-[150] shadow-xl hover:scale-105 transition-transform italic">← QUIT</button>

      {currentGame === 'connect4' && (
        <div className="flex flex-col items-center gap-6 md:gap-8 mt-16 md:mt-20 w-full max-w-lg pb-40 px-4">
          <div className="text-center space-y-2 mb-4">
            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">GRAVITY CORE</h3>
            <p className="text-[7px] md:text-[8px] font-bold text-blue-500 uppercase tracking-[0.4em]">4 IN A ROW TO CONQUER</p>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-3 h-3 rounded-full ${c4Turn === 'Anvi' ? 'bg-purple-500 animate-pulse' : 'bg-white/10'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest italic">{c4Turn}'S TURN</span>
            <div className={`w-3 h-3 rounded-full ${c4Turn === 'Zxhan' ? 'bg-blue-500 animate-pulse' : 'bg-white/10'}`} />
          </div>
          <div className="bg-blue-600/20 p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem] border border-blue-500/30 shadow-[0_0_50px_rgba(37,99,235,0.2)]">
            <div className="grid grid-cols-7 gap-2 md:gap-3">
              {c4Board[0].map((_, colIndex) => (
                <div key={colIndex} className="flex flex-col gap-2 md:gap-3">
                  {[0, 1, 2, 3, 4, 5].map(rowIndex => {
                    const cell = c4Board[rowIndex][colIndex];
                    return (
                      <button
                        key={rowIndex}
                        onClick={() => handleC4Click(colIndex)}
                        className={`w-10 h-10 md:w-14 md:h-14 rounded-full border border-white/5 transition-all flex items-center justify-center
                          ${!cell ? 'bg-black/40 hover:bg-black/60' : (cell === 'Anvi' ? 'bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]')}
                        `}
                      >
                        {cell && <div className="w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-white/20" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {currentGame === 'word' && (
        <div className="flex flex-col items-center gap-8 md:gap-10 mt-16 md:mt-20 w-full max-w-2xl pb-40 px-4">
          <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">HANGMAN DUEL</h3>
          {wordState.status === 'setting' ? (
            <div className="w-full max-w-sm space-y-4 md:space-y-6">
              <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center mb-4">
                {HANGMAN_WORDS.slice(0, 5).map(w => (
                  <button key={w} onClick={() => setWordInput(w)} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[7px] md:text-[8px] font-bold opacity-40 hover:opacity-100">{w}</button>
                ))}
              </div>
              <input value={wordInput} onChange={e => setWordInput(e.target.value)} placeholder="ENTER SECRET WORD..." className="w-full bg-white/5 border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-6 text-xl md:text-2xl font-black uppercase text-center outline-none focus:border-white transition-all shadow-inner placeholder:opacity-20" />
              <button onClick={handleWordSet} className="w-full py-4 md:py-6 bg-white text-black rounded-2xl md:rounded-3xl font-black uppercase italic tracking-tighter text-base md:text-lg shadow-2xl">START MATCH</button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-8 md:gap-12">
              <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                {wordState.word.split('').map((l, i) => (
                  <div key={i} className={`w-10 h-14 md:w-16 md:h-20 bg-white/5 border-2 ${wordState.guesses.includes(l) ? 'border-green-500/50' : 'border-white/5'} rounded-xl md:rounded-2xl flex items-center justify-center text-2xl md:text-3xl font-black italic`}>
                    {wordState.guesses.includes(l) || wordState.status !== 'guessing' ? l : ''}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-9 lg:grid-cols-13 gap-1.5 md:gap-2">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => (
                  <button key={l} disabled={wordState.guesses.includes(l) || wordState.setter === user || wordState.status !== 'guessing'} onClick={() => handleGuess(l)} className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl font-black text-[10px] md:text-xs transition-all ${wordState.guesses.includes(l) ? (wordState.word.includes(l) ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500') : 'bg-white/10 hover:bg-white hover:text-black'}`}>{l}</button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-4 md:gap-6">
                <div className="flex gap-1 md:gap-1.5">
                  {Array(7).fill(null).map((_, i) => (
                    <div key={i} className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${i < wordState.guesses.filter(l => !wordState.word.includes(l)).length ? 'bg-red-500' : 'bg-white/10'}`} />
                  ))}
                </div>
                {wordState.status !== 'guessing' && (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4 md:gap-6">
                    <span className={`text-4xl md:text-5xl font-black uppercase italic tracking-tighter ${wordState.status === 'won' ? 'text-green-500' : 'text-red-500'}`}>{wordState.status === 'won' ? 'VICTORY' : 'DEFEAT'}</span>
                    {wordState.status === 'lost' && <p className="text-white/40 font-bold uppercase tracking-widest text-[10px] md:text-xs">The word was: {wordState.word}</p>}
                    <button onClick={() => { setWordState({ word: '', guesses: [], setter: '', status: 'setting' }); sync.publish('game', { type: 'word', state: { word: '', guesses: [], setter: '', status: 'setting' } }); }} className="px-8 md:px-10 py-3 md:py-4 bg-white/10 border border-white/10 rounded-full font-black uppercase text-[8px] md:text-[10px] tracking-widest italic">NEW DUEL</button>
                  </motion.div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {currentGame === 'rps' && (
        <div className="flex flex-col items-center gap-8 md:gap-12 mt-16 md:mt-20 w-full max-w-md pb-40 px-4">
          <div className="text-center space-y-2">
            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">CLASH PRO</h3>
            <p className="text-[7px] md:text-[8px] font-bold opacity-30 uppercase tracking-[0.4em]">ROCK PAPER SCISSORS LIZARD SPOCK</p>
          </div>
          <div className="flex justify-between w-full mb-4 px-4 md:px-8">
            <div className="flex flex-col items-center gap-3">
              <div className={`w-16 h-16 md:w-20 md:h-20 rounded-[1.5rem] md:rounded-3xl border-2 ${rpsState.Anvi ? 'bg-white/10 border-white' : 'bg-white/5 border-white/5'} flex items-center justify-center text-3xl md:text-4xl shadow-2xl`}>
                {rpsState.Anvi && rpsState.Zxhan ? getRPSGlyph(rpsState.Anvi) : (rpsState.Anvi ? '✅' : '?')}
              </div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest opacity-20 italic">ANVI</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className={`w-16 h-16 md:w-20 md:h-20 rounded-[1.5rem] md:rounded-3xl border-2 ${rpsState.Zxhan ? 'bg-white/10 border-white' : 'bg-white/5 border-white/5'} flex items-center justify-center text-3xl md:text-4xl shadow-2xl`}>
                {rpsState.Anvi && rpsState.Zxhan ? getRPSGlyph(rpsState.Zxhan) : (rpsState.Zxhan ? '✅' : '?')}
              </div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest opacity-20 italic">ZXHAN</span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 md:gap-2 w-full">
            {[
              { id: 'rock', glyph: '✊', label: 'ROCK' },
              { id: 'paper', glyph: '✋', label: 'PAPER' },
              { id: 'scissors', glyph: '✌️', label: 'SCISSORS' },
              { id: 'lizard', glyph: '🦎', label: 'LIZARD' },
              { id: 'spock', glyph: '🖖', label: 'SPOCK' }
            ].map(m => (
              <button key={m.id} disabled={!!rpsState[user] || !!winner} onClick={() => handleRPS(m.id)} className={`p-3 md:p-4 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl flex flex-col items-center gap-1 md:gap-2 transition-all ${rpsState[user] === m.id ? 'bg-white text-black' : 'hover:bg-white/10 opacity-40 hover:opacity-100'}`}>
                <span className="text-lg md:text-xl">{m.glyph}</span>
                <span className="text-[6px] md:text-[7px] font-black uppercase italic">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {currentGame === 'reaction' && (
        <div className="flex flex-col items-center gap-8 md:gap-12 mt-16 md:mt-20 w-full max-w-md pb-40 px-4">
          <div className="text-center space-y-2">
            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">BLITZ REACTION</h3>
            <p className="text-[7px] md:text-[8px] font-bold opacity-30 uppercase tracking-[0.4em]">CLICK FAST WHEN IT TURNS GREEN</p>
          </div>

          <button
            onClick={handleReactionClick}
            disabled={reactionState.status === 'finished' || winner}
            className={`w-full aspect-square rounded-[3rem] border-8 transition-all duration-75 flex flex-col items-center justify-center gap-4 shadow-2xl
              ${reactionState.status === 'waiting' ? 'bg-red-500/10 border-red-500/20' : ''}
              ${reactionState.status === 'ready' ? 'bg-green-500 border-green-400 scale-105 shadow-[0_0_50px_rgba(34,197,94,0.4)]' : ''}
              ${reactionState.status === 'finished' ? 'bg-white/5 border-white/10' : ''}
            `}
          >
            {reactionState.status === 'waiting' && <span className="text-2xl font-black italic animate-pulse">WAIT...</span>}
            {reactionState.status === 'ready' && <span className="text-4xl font-black italic text-black animate-bounce">HIT!</span>}
            {reactionState.status === 'finished' && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl font-black italic">{reactionState.scores[user] || '---'}ms</span>
                <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">YOUR TIME</span>
              </div>
            )}
          </button>

          {reactionState.status === 'finished' && reactionState.scores[user] && (
            <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-30 italic">WAITING FOR OTHER PLAYER...</span>
            </div>
          )}

          {reactionState.status !== 'waiting' && reactionState.status !== 'ready' && (
            <button onClick={startReactionGame} className="px-12 py-5 bg-white text-black rounded-full font-black uppercase italic tracking-widest text-xs hover:scale-105 transition-transform shadow-2xl">START BLITZ</button>
          )}
        </div>
      )}

      {currentGame === 'tictactoe' && (
        <div className="flex flex-col items-center gap-6 md:gap-8 mt-16 md:mt-20 w-full max-w-md pb-40">
          <div className="text-center space-y-2 mb-4">
            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">INFINITY TACTICS</h3>
            <p className="text-[7px] md:text-[8px] font-bold text-[var(--accent)] uppercase tracking-[0.4em]">ONLY 3 MARKS ALLOWED // NO DRAWS POSSIBLE</p>
          </div>
          <h3 className="text-lg md:text-xl font-black italic uppercase tracking-tighter">{calculateTTTWinner(board) ? (calculateTTTWinner(board) === 'DRAW' ? "DRAW" : `${calculateTTTWinner(board)} WINS`) : `${xIsNext ? 'X' : 'O'} TURN`}</h3>
          <div className="grid grid-cols-3 gap-2 md:gap-3 p-3 md:p-4 bg-white/[0.03] border border-white/5 rounded-[2rem] md:rounded-[2.5rem] w-full aspect-square shadow-2xl relative">
            {board.map((cell, i) => {
              const myMarks = tttHistory.filter(h => h.symbol === (xIsNext ? 'X' : 'O'));
              const isOldest = myMarks.length === 3 && myMarks[0].index === i;

              return (
                <button
                  key={i}
                  disabled={!!winner}
                  onClick={() => handleTTTClick(i)}
                  className={`bg-[#0a0a0a] border border-white/5 rounded-2xl md:rounded-3xl text-4xl md:text-5xl font-display font-black flex items-center justify-center hover:border-white/20 transition-all active:scale-90 shadow-inner relative overflow-hidden ${isOldest ? 'opacity-30' : ''}`}
                >
                  <span className={cell === 'X' ? 'text-blue-500' : 'text-purple-500'}>{cell}</span>
                  {isOldest && <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentGame === 'truthordare' && (
        <div className="flex flex-col items-center gap-8 md:gap-12 mt-16 md:mt-20 w-full max-w-lg pb-40 px-4">
          <div className="text-center space-y-2">
            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">FLAME DUEL</h3>
            <p className="text-[7px] md:text-[8px] font-bold text-orange-500 uppercase tracking-[0.4em]">EXTREME TRUTH OR DARE</p>
          </div>

          <div className="w-full flex flex-col gap-4">
            {tdActive.type ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-10 md:p-16 bg-white/[0.03] border border-white/10 rounded-[3rem] text-center shadow-2xl relative overflow-hidden">
                <div className={`absolute top-0 left-0 right-0 h-2 ${tdActive.type === 'truth' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                <span className={`text-[10px] font-black uppercase tracking-[0.5em] mb-4 block ${tdActive.type === 'truth' ? 'text-blue-500' : 'text-orange-500'}`}>{tdActive.type}</span>
                <p className="text-xl md:text-3xl font-black italic uppercase tracking-tighter leading-tight">{tdActive.content}</p>
                <button onClick={() => { const a = { type: '', content: '' }; setTdActive(a as any); sync.publish('game', { type: 'truthordare', active: a }); }} className="mt-12 px-8 py-3 bg-white/5 hover:bg-white/10 rounded-full font-black uppercase text-[8px] tracking-widest transition-all">NEXT ROUND</button>
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                <button onClick={() => {
                  const truths = ["Who was your first crush?", "What's the biggest lie you've told me?", "What's your biggest insecurity?", "If you could change one thing about yourself, what would it be?", "What's the most embarrassing thing you've ever done?", "What is one thing you're glad your parents don't know?", "What's the most useless thing you've ever bought?"];
                  const t = { type: 'truth', content: truths[Math.floor(Math.random() * truths.length)] };
                  setTdActive(t as any); sync.publish('game', { type: 'truthordare', active: t });
                }} className="p-8 md:p-12 bg-blue-500/10 border border-blue-500/20 rounded-[2.5rem] hover:bg-blue-500 hover:text-black transition-all group flex flex-col items-center gap-4">
                  <HelpCircle className="w-10 h-10 group-hover:scale-110 transition-transform" />
                  <span className="font-black italic uppercase tracking-tighter text-2xl">TRUTH</span>
                </button>
                <button onClick={() => {
                  const dares = ["Post a screenshot of our chat (don't).", "Sing a song chosen by me for 1 minute.", "Send me the 5th photo in your gallery.", "Do 20 pushups while saying my name.", "Try to juggle 3 random items.", "Speak in an accent for the next 10 minutes.", "Dance without music for 2 minutes."];
                  const d = { type: 'dare', content: dares[Math.floor(Math.random() * dares.length)] };
                  setTdActive(d as any); sync.publish('game', { type: 'truthordare', active: d });
                }} className="p-8 md:p-12 bg-orange-500/10 border border-orange-500/20 rounded-[2.5rem] hover:bg-orange-500 hover:text-black transition-all group flex flex-col items-center gap-4">
                  <Flame className="w-10 h-10 group-hover:scale-110 transition-transform" />
                  <span className="font-black italic uppercase tracking-tighter text-2xl">DARE</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-[#0a0a0a] border border-white/10 p-10 md:p-16 rounded-[3rem] text-center shadow-[0_0_100px_rgba(255,255,255,0.1)] flex flex-col items-center gap-8 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              <div className="relative">
                <div className="absolute inset-0 blur-3xl bg-white/20 animate-pulse" />
                <h2 className="text-5xl md:text-7xl font-display font-black italic uppercase tracking-tighter text-white relative z-10">{winner.msg}</h2>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/30">Match Concluded</p>
              <button
                onClick={() => {
                  if (currentGame === 'tictactoe') { setBoard(Array(9).fill(null)); setTttHistory([]); sync.publish('game', { type: 'tictactoe', board: Array(9).fill(null), xIsNext: true, history: [] }); }
                  if (currentGame === 'rps') { setRpsState({ Anvi: null, Zxhan: null }); sync.publish('game', { type: 'rps', state: { Anvi: null, Zxhan: null } }); }
                  if (currentGame === 'connect4') { setC4Board(Array(6).fill(null).map(() => Array(7).fill(null))); sync.publish('game', { type: 'connect4', board: Array(6).fill(null).map(() => Array(7).fill(null)), turn: 'Anvi' }); }
                  if (currentGame === 'word') { setWordState({ word: '', guesses: [], setter: '', status: 'setting' }); sync.publish('game', { type: 'word', state: { word: '', guesses: [], setter: '', status: 'setting' } }); }
                  if (currentGame === 'reaction') { setReactionState({ status: 'waiting', startTime: 0, scores: {} }); sync.publish('game', { type: 'reaction', state: { status: 'waiting', startTime: 0, scores: {} } }); }
                  resetGame();
                }}
                className="px-12 py-5 bg-white text-black rounded-full font-black uppercase italic tracking-widest text-xs hover:scale-105 transition-transform shadow-2xl"
              >
                RE-MATCH
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function checkC4Winner(board: (string | null)[][], row: number, col: number) {
  const symbol = board[row][col];
  if (!symbol) return false;

  const check = (dr: number, dc: number) => {
    let count = 1;
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) count++;
      else break;
    }
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) count++;
      else break;
    }
    return count >= 4;
  };

  return check(0, 1) || check(1, 0) || check(1, 1) || check(1, -1);
}

function calculateTTTWinner(squares: (string | null)[]) {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (let line of lines) {
    const [a, b, c] = line;
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) return squares[a];
  }
  return squares.includes(null) ? null : 'DRAW';
}


function getRPSGlyph(move: string) {
  const glyphs: any = { rock: '✊', paper: '✋', scissors: '✌️', lizard: '🦎', spock: '🖖' };
  return glyphs[move] || '?';
}

function getRPSResult(m1: string, m2: string) {
  if (m1 === m2) return "TIE";
  const rules: any = {
    rock: ['scissors', 'lizard'],
    paper: ['rock', 'spock'],
    scissors: ['paper', 'lizard'],
    lizard: ['spock', 'paper'],
    spock: ['scissors', 'rock']
  };
  if (rules[m1].includes(m2)) return "ANVI WINS";
  return "ZXHAN WINS";
}
