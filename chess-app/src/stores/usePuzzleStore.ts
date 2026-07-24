import { create } from 'zustand';
import type { Puzzle } from '@/types';

interface PuzzleState {
  currentPuzzle: Puzzle | null;
  feed: Puzzle[];
  sessionHistory: PuzzleId[];
  setCurrentPuzzle: (puzzle: Puzzle) => void;
  setFeed: (puzzles: Puzzle[]) => void;
  appendToFeed: (puzzles: Puzzle[]) => void;
  addToHistory: (puzzleId: PuzzleId) => void;
}

type PuzzleId = string;

export const usePuzzleStore = create<PuzzleState>((set) => ({
  currentPuzzle: null,
  feed: [],
  sessionHistory: [],
  setCurrentPuzzle: (puzzle) => set({ currentPuzzle: puzzle }),
  setFeed: (puzzles) => set({ feed: puzzles }),
  appendToFeed: (puzzles) => set((state) => ({ feed: [...state.feed, ...puzzles] })),
  addToHistory: (puzzleId) =>
    set((state) => ({ sessionHistory: [...state.sessionHistory, puzzleId] })),
}));
