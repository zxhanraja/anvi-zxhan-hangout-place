
export type User = 'Zxhan' | 'Anvi';

export interface Message {
  id: string;
  sender: User;
  content?: string;
  image?: string; // Base64 image data
  type: 'text' | 'image' | 'voice';
  timestamp: number;
  expiresAt: number;
  reactions?: Record<string, User[]>; // emoji -> list of users
}

export interface SyncState {
  theme: {
    accent: string;
  };
  music: {
    isPlaying: boolean;
    ytId: string;
    startTime: number;
    title: string;
    addedBy: User;
  };
  game: {
    type: 'tictactoe' | 'rps' | 'connect4' | 'word';
    board?: any;
    xIsNext?: boolean;
    rpsState?: Record<User, string | null>;
    wordState?: {
      word: string;
      hints: string[];
      guesses: string[];
      setter: User;
      status: 'setting' | 'guessing' | 'won';
    };
  };
  presence: Record<string, {
    isOnline: boolean;
    lastSeen: number;
    mood: string;
  }>;
}
