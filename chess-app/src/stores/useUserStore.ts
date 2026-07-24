import { create } from 'zustand';
import { CALIBRATION_PUZZLES } from '@/constants';
import { calculateElo } from '@/services/elo';

const K_CALIBRATING = 32;
const K_ESTABLISHED = 16;

interface UserState {
  elo: number;
  isCalibrated: boolean;
  calibrationCount: number;
  streakDays: number;
  lastActiveDate: string | null;
  isPremium: boolean;
  setElo: (elo: number) => void;
  updateElo: (puzzleRating: number, solved: boolean) => void;
  incrementCalibration: () => void;
  updateStreak: () => void;
  setPremium: (value: boolean) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  elo: 800,
  isCalibrated: false,
  calibrationCount: 0,
  streakDays: 0,
  lastActiveDate: null,
  isPremium: false,
  setElo: (elo) => set({ elo }),
  updateElo: (puzzleRating, solved) => {
    const { elo, isCalibrated } = get();
    const kFactor = isCalibrated ? K_ESTABLISHED : K_CALIBRATING;
    const { newElo } = calculateElo(elo, puzzleRating, solved, kFactor);
    set({ elo: newElo });
  },
  incrementCalibration: () => {
    const count = get().calibrationCount + 1;
    set({ calibrationCount: count, isCalibrated: count >= CALIBRATION_PUZZLES });
  },
  updateStreak: () => {
    const today = new Date().toISOString().split('T')[0];
    const last = get().lastActiveDate;
    if (last === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const streakDays = last === yesterday ? get().streakDays + 1 : 1;
    set({ streakDays, lastActiveDate: today });
  },
  setPremium: (value) => set({ isPremium: value }),
}));
