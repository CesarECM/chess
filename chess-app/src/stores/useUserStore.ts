import { create } from 'zustand';
import { CALIBRATION_PUZZLES } from '@/constants';

interface UserState {
  elo: number;
  isCalibrated: boolean;
  calibrationCount: number;
  streakDays: number;
  lastActiveDate: string | null;
  isPremium: boolean;
  setElo: (elo: number) => void;
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
