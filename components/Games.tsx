
import React, { useState, useEffect } from 'react';
import { sync } from '../services/sync';
import { User } from '../types';
import { LayoutGrid, Grid2X2, Skull, Flame, Zap, HelpCircle, Hand, Scissors, Square, User2, Dices } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const Games: React.FC<{ user: User }> = ({ user }) => {
  const [currentGame, setCurrentGame] = useState<'tictactoe' | 'connect4' | 'word' | 'truthordare' | 'reaction' | 'rps' | 'menu'>('menu');
  const [scores, setScores] = useState<Record<string, number>>({ Anvi: 0, Zxhan: 0 });

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
    });

    const unsubScores = sync.subscribe('scores', (data: any) => {
      setScores(prev => ({ ...prev, [data.user]: data.score }));
    });

    return () => {
      unsub();
      unsubScores();
    };
  }, []);

  const handleWin = (winner: 'Anvi') => {
    sync.updateScore('Anvi', 1);
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
      if (winner === 'O') handleWin('Anvi'); // Anvi wins (Zxhan loses)
    } else {
      nextBoard[i] = symbol;
      setBoard(nextBoard);
      setXIsNext(!xIsNext);
      setTttHistory(nextHistory);
      sync.publish('game', { type: 'tictactoe', board: nextBoard, xIsNext: !xIsNext, history: nextHistory });

      const winner = calculateTTTWinner(nextBoard);
      if (winner === 'O') handleWin('Anvi');
    }
  };

  const handleC4Click = (colIndex: number) => {
    if (c4Turn !== user) return;
    const nextBoard = c4Board.map(row => [...row]);
    let placed = false;
    for (let r = 5; r >= 0; r--) { if (!nextBoard[r][colIndex]) { nextBoard[r][colIndex] = user; placed = true; break; } }
    if (!placed) return;
    const nextTurn = user === 'Anvi' ? 'Zxhan' : 'Anvi';
    setC4Board(nextBoard); setC4Turn(nextTurn);
    sync.publish('game', { type: 'connect4', board: nextBoard, turn: nextTurn });

    // Winner check simplified forConnect 4 (omitted for brevity in this specific task but would call handleWin)
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

  const HANGMAN_WORDS = ['AESTHETIC', 'CYBERPUNK', 'METAVERSE', 'BLOCKCHAIN', 'ALGORITHM', 'SYMPHONY', 'EUPHORIA', 'NOSTALGIA', 'ETHEREAL', 'PHANTOM', 'QUARTZ', 'ZODIAC', 'VELOCITY', 'ZENITH', 'OBLIVION', 'SERENDIPITY'];

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
    const correctGuesses = nextGuesses.filter(l => uniqueWordLetters.size === correctGuesses.length);
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
            <motion.button key={game.id} whileHover={{ y: -5, scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setCurrentGame(game.id as any)} className="p-6 md:p-8 bg-white/[0.03] border border-white/[0.06] rounded-[2rem] md:rounded-[2.5rem] hover:bg-white hover:text-black transition-all group flex items-center gap-4 md:gap-6 text-left shadow-2xl">
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
              <button key={m.id} disabled={!!rpsState[user]} onClick={() => handleRPS(m.id)} className={`p-3 md:p-4 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl flex flex-col items-center gap-1 md:gap-2 transition-all ${rpsState[user] === m.id ? 'bg-white text-black' : 'hover:bg-white/10 opacity-40 hover:opacity-100'}`}>
                <span className="text-lg md:text-xl">{m.glyph}</span>
                <span className="text-[6px] md:text-[7px] font-black uppercase italic">{m.label}</span>
              </button>
            ))}
          </div>

          {rpsState.Anvi && rpsState.Zxhan && (
            <div className="flex flex-col items-center gap-4 md:gap-6">
              <div className="text-lg md:text-xl font-black italic uppercase tracking-widest text-[var(--accent)]">{getRPSResult(rpsState.Anvi, rpsState.Zxhan)}</div>
              <button onClick={() => { const s = { Anvi: null, Zxhan: null }; setRpsState(s); sync.publish('game', { type: 'rps', state: s }); }} className="px-10 md:px-12 py-4 md:py-5 bg-white text-black rounded-full font-black uppercase italic tracking-tighter text-xs md:text-sm shadow-2xl">PLAY AGAIN</button>
            </div>
          )}
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
                  onClick={() => handleTTTClick(i)}
                  className={`bg-[#0a0a0a] border border-white/5 rounded-2xl md:rounded-3xl text-4xl md:text-5xl font-display font-black flex items-center justify-center hover:border-white/20 transition-all active:scale-90 shadow-inner relative overflow-hidden ${isOldest ? 'opacity-30' : ''}`}
                >
                  {cell}
                  {isOldest && <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />}
                </button>
              );
            })}
          </div>
          <button onClick={() => { setBoard(Array(9).fill(null)); setXIsNext(true); setTttHistory([]); sync.publish('game', { type: 'tictactoe', board: Array(9).fill(null), xIsNext: true, history: [] }); }} className="px-8 md:px-10 py-3 md:py-4 bg-white text-black rounded-full font-black uppercase italic text-[8px] md:text-[10px] tracking-widest">RESET</button>
        </div>
      )}
    </div>
  );
};

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
