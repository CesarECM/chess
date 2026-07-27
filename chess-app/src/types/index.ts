export type UserId = string;
export type PuzzleId = string;

export interface User {
  id: UserId;
  email?: string;
  isGuest: boolean;
  elo: number;
  createdAt: string;
}

export type TacticType =
  | 'mate'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discoveredAttack'
  | 'deflection'
  | 'other';

export interface Puzzle {
  id: PuzzleId;
  fen: string;
  moves: string[];        // solución en notación UCI
  rating: number;
  ratingDeviation: number;
  popularity: number;
  themes: TacticType[];
  gameUrl?: string;
}

export interface UserPuzzleProgress {
  userId: UserId;
  puzzleId: PuzzleId;
  stability: number;        // FSRS: S
  difficulty: number;       // FSRS: D
  retrievability: number;   // FSRS: R
  state: 0 | 1 | 2 | 3;   // FSRS: New | Learning | Review | Relearning
  lapses: number;           // FSRS: times forgotten in Review state
  learningSteps: number;    // FSRS: step within learning/relearning sequence
  repetitions: number;
  lastRating: 1 | 2 | 3 | 4; // Again | Hard | Good | Easy
  lastReviewedAt: string;
  nextReviewAt: string;
}

export type FSRSRating = 1 | 2 | 3 | 4;

export type MessageType =
  | 'streak'
  | 'milestone_solved'
  | 'rank_up'
  | 'medal'
  | 'personal_best_elo'
  | 'perfect_run'
  | 'comeback'
  | 'session_elo_gain'
  | 'weekly_summary';

export interface ProgressMessage {
  id: string;
  kind: 'progress';
  type: MessageType;
  payload: Record<string, unknown>;
}

export type FeedItem = Puzzle | ProgressMessage;
