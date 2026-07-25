import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CALIBRATION_PUZZLES } from '@/constants';
import { calculateElo } from '@/services/elo';
import { evaluateNewMedals } from '@/services/medals';
import type { Profile } from '@/services/auth';
import type { TacticType } from '@/types';

const K_CALIBRATING = 32;
const K_ESTABLISHED = 16;

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export interface EloSnapshot {
  date: string; // YYYY-MM-DD
  elo: number;
}

interface UserState {
  elo: number;
  isCalibrated: boolean;
  calibrationCount: number;
  streakDays: number;
  streakLongest: number;
  lastActiveDate: string | null;
  weekStartDate: string | null;
  weeklyPuzzleCount: number;
  isPremium: boolean;
  premiumUntil: string | null; // ISO date — referral reward expiry
  puzzlesCompleted: number;
  puzzlesFailed: number;
  unlockedMedals: string[];
  solvedByTheme: Partial<Record<TacticType, number>>;
  failedByTheme: Partial<Record<TacticType, number>>;
  eloHistory: EloSnapshot[];
  notificationStreakHour: number; // hora local (0-23) para el recordatorio de racha
  preferredLanguage: string | null; // null = auto (device locale)
  gdprConsentDate: string | null; // ISO date cuando el usuario dio consentimiento
  analyticsConsent: boolean; // true = acepta analytics (PostHog)

  setElo: (elo: number) => void;
  updateElo: (puzzleRating: number, solved: boolean) => void;
  incrementCalibration: () => void;
  updateStreak: () => void;
  setNotificationStreakHour: (hour: number) => void;
  setPreferredLanguage: (lang: string | null) => void;
  setGdprConsent: (analytics: boolean) => void;
  setPremium: (value: boolean) => void;
  setPremiumUntil: (date: string) => void;
  /** Consolidated per-puzzle stats update: streak, counts, tactic tracking, medals. */
  incrementPuzzleStats: (solved: boolean, themes: TacticType[]) => void;
  hydrate: (profile: Profile) => void;
  reset: () => void;
}

/** Returns true if the user has an active paid subscription OR a referral reward that hasn't expired. */
export const selectIsPremiumActive = (s: Pick<UserState, 'isPremium' | 'premiumUntil'>): boolean =>
  s.isPremium || (s.premiumUntil ? new Date(s.premiumUntil) > new Date() : false);

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      elo: 800,
      isCalibrated: false,
      calibrationCount: 0,
      streakDays: 0,
      streakLongest: 0,
      lastActiveDate: null,
      weekStartDate: null,
      weeklyPuzzleCount: 0,
      isPremium: false,
      premiumUntil: null,
      puzzlesCompleted: 0,
      puzzlesFailed: 0,
      unlockedMedals: [],
      solvedByTheme: {},
      failedByTheme: {},
      eloHistory: [],
      notificationStreakHour: 20,
      preferredLanguage: null,
      gdprConsentDate: null,
      analyticsConsent: false,

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
        const { lastActiveDate, streakDays, streakLongest } = get();
        if (lastActiveDate === today) return;
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const newStreak = lastActiveDate === yesterday ? streakDays + 1 : 1;
        set({
          streakDays: newStreak,
          streakLongest: Math.max(streakLongest, newStreak),
          lastActiveDate: today,
        });
      },

      incrementPuzzleStats: (solved, themes) => {
        const state = get();
        const today = new Date().toISOString().split('T')[0];

        // ── Streak ──────────────────────────────────────────────
        let { streakDays } = state;
        let lastActiveDate = state.lastActiveDate;
        if (lastActiveDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          streakDays = lastActiveDate === yesterday ? streakDays + 1 : 1;
          lastActiveDate = today;
        }
        const streakLongest = Math.max(state.streakLongest, streakDays);

        // ── Weekly count ─────────────────────────────────────────
        const monday = getMondayISO(today);
        const isNewWeek = state.weekStartDate !== monday;
        const weeklyPuzzleCount = solved
          ? (isNewWeek ? 1 : state.weeklyPuzzleCount + 1)
          : (isNewWeek ? 0 : state.weeklyPuzzleCount);

        // ── Puzzle counts ─────────────────────────────────────────
        const puzzlesCompleted = solved ? state.puzzlesCompleted + 1 : state.puzzlesCompleted;
        const puzzlesFailed    = !solved ? state.puzzlesFailed + 1 : state.puzzlesFailed;

        // ── Tactic counts ─────────────────────────────────────────
        const solvedByTheme = { ...state.solvedByTheme };
        const failedByTheme = { ...state.failedByTheme };
        if (solved) {
          for (const theme of themes) {
            solvedByTheme[theme] = (solvedByTheme[theme] ?? 0) + 1;
          }
        } else {
          for (const theme of themes) {
            failedByTheme[theme] = (failedByTheme[theme] ?? 0) + 1;
          }
        }

        // ── ELO daily snapshot ────────────────────────────────────
        // get().elo reflects the value AFTER updateElo() ran before this call
        const currentElo = get().elo;
        const eloHistory = [...state.eloHistory];
        if (eloHistory.length === 0 || eloHistory[eloHistory.length - 1].date !== today) {
          eloHistory.push({ date: today, elo: currentElo });
          if (eloHistory.length > 30) eloHistory.shift();
        } else {
          eloHistory[eloHistory.length - 1] = { date: today, elo: currentElo };
        }

        // ── Medals ───────────────────────────────────────────────
        const newMedals = evaluateNewMedals({
          puzzlesCompleted,
          streakDays,
          elo: state.elo,
          solvedByTheme,
          unlockedMedals: state.unlockedMedals,
        });
        const unlockedMedals = newMedals.length > 0
          ? [...state.unlockedMedals, ...newMedals]
          : state.unlockedMedals;

        set({
          streakDays,
          streakLongest,
          lastActiveDate,
          weekStartDate: monday,
          weeklyPuzzleCount,
          puzzlesCompleted,
          puzzlesFailed,
          solvedByTheme,
          failedByTheme,
          eloHistory,
          unlockedMedals,
        });
      },

      setNotificationStreakHour: (hour) => set({ notificationStreakHour: hour }),
      setPreferredLanguage: (lang) => set({ preferredLanguage: lang }),
      setGdprConsent: (analytics) => set({
        gdprConsentDate: new Date().toISOString(),
        analyticsConsent: analytics,
      }),
      setPremium: (value) => set({ isPremium: value }),
      setPremiumUntil: (date) => set({ premiumUntil: date }),

      hydrate: (profile) => set({
        elo: profile.elo,
        isCalibrated: profile.isCalibrated,
        calibrationCount: profile.isCalibrated ? CALIBRATION_PUZZLES : 0,
        streakDays: profile.streakCurrent,
        streakLongest: profile.streakLongest,
        isPremium: profile.isPremium,
      }),

      reset: () => set({
        elo: 800,
        isCalibrated: false,
        calibrationCount: 0,
        streakDays: 0,
        streakLongest: 0,
        lastActiveDate: null,
        weekStartDate: null,
        weeklyPuzzleCount: 0,
        isPremium: false,
        premiumUntil: null,
        puzzlesCompleted: 0,
        puzzlesFailed: 0,
        unlockedMedals: [],
        solvedByTheme: {},
        failedByTheme: {},
        eloHistory: [],
        notificationStreakHour: 20,
        preferredLanguage: null,
        // GDPR no se resetea al hacer logout — el usuario ya consintió
      }),
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        elo: state.elo,
        isCalibrated: state.isCalibrated,
        calibrationCount: state.calibrationCount,
        streakDays: state.streakDays,
        streakLongest: state.streakLongest,
        lastActiveDate: state.lastActiveDate,
        weekStartDate: state.weekStartDate,
        weeklyPuzzleCount: state.weeklyPuzzleCount,
        isPremium: state.isPremium,
        premiumUntil: state.premiumUntil,
        puzzlesCompleted: state.puzzlesCompleted,
        puzzlesFailed: state.puzzlesFailed,
        unlockedMedals: state.unlockedMedals,
        solvedByTheme: state.solvedByTheme,
        failedByTheme: state.failedByTheme,
        eloHistory: state.eloHistory,
        notificationStreakHour: state.notificationStreakHour,
        preferredLanguage: state.preferredLanguage,
        gdprConsentDate: state.gdprConsentDate,
        analyticsConsent: state.analyticsConsent,
      }),
    },
  ),
);
