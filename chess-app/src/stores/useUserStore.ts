import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  PRE_ELO_LOWER,
  PRE_ELO_UPPER,
  PRE_ELO_ONBOARDING_WINDOW,
  PRE_ELO_CONVERGENCE,
  RECALIBRATION_DAYS,
  DRIFT_SAMPLE_SIZE,
  DRIFT_THRESHOLD,
  CALIB_FAST_SOLVE_MS,
  CALIB_FAST_SOLVE_BONUS,
  CALIB_MISCLICK_MS,
  CALIB_MISCLICK_CREDIT,
  CALIB_SLOW_FAIL_MS,
  CALIB_SLOW_FAIL_CREDIT,
} from '@/constants';
import { calculateElo } from '@/services/elo';
import { evaluateNewMedals } from '@/services/medals';
import type { Profile } from '@/services/auth';
import type { TacticType } from '@/types';
import type { BoardThemeId, PieceSetId } from '@/constants/boardThemes';

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

interface DriftSample {
  expected: number;
  actual: number; // 1 = solved, 0 = failed
}

interface UserState {
  elo: number;
  preEloLow: number | null;      // null = calibrated
  preEloHigh: number | null;     // null = calibrated
  preEloStartLow: number;        // bounds when this calibration session started
  preEloStartHigh: number;
  recentDriftSamples: DriftSample[];
  declaredLevel: string | null;
  firstPuzzleRating: number | null;
  calibrationBounds: { low: number; high: number };
  streakDays: number;
  streakLongest: number;
  lastActiveDate: string | null;
  weekStartDate: string | null;
  weeklyPuzzleCount: number;
  isPremium: boolean;
  premiumUntil: string | null;
  puzzlesCompleted: number;
  puzzlesFailed: number;
  unlockedMedals: string[];
  solvedByTheme: Partial<Record<TacticType, number>>;
  failedByTheme: Partial<Record<TacticType, number>>;
  eloHistory: EloSnapshot[];
  notificationStreakHour: number;
  preferredLanguage: string | null;
  gdprConsentDate: string | null;
  analyticsConsent: boolean;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  onboardingCompleted: boolean;

  setElo: (elo: number) => void;
  updateElo: (puzzleRating: number, solved: boolean) => number;
  calibrationPendingConfirmation: boolean;
  updatePreElo: (puzzleRating: number, solved: boolean, elapsedMs?: number) => void;
  checkRecalibrationNeeded: () => boolean;
  startRecalibration: () => void;
  setCalibrationBounds: (low: number, high: number) => void;
  clearFirstPuzzleRating: () => void;
  updateStreak: () => void;
  setNotificationStreakHour: (hour: number) => void;
  setPreferredLanguage: (lang: string | null) => void;
  setBoardTheme: (theme: BoardThemeId) => void;
  setPieceSet: (set: PieceSetId) => void;
  completeOnboarding: (levelElo: number, theme: BoardThemeId, pieces: PieceSetId, levelKey: string) => void;
  setGdprConsent: (analytics: boolean) => void;
  setPremium: (value: boolean) => void;
  setPremiumUntil: (date: string) => void;
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
      preEloLow: PRE_ELO_LOWER,
      preEloHigh: PRE_ELO_UPPER,
      preEloStartLow: PRE_ELO_LOWER,
      preEloStartHigh: PRE_ELO_UPPER,
      recentDriftSamples: [],
      declaredLevel: null,
      firstPuzzleRating: null,
      calibrationBounds: { low: PRE_ELO_LOWER, high: PRE_ELO_UPPER },
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
      boardTheme: 'classic',
      pieceSet: 'cburnett',
      onboardingCompleted: false,
      calibrationPendingConfirmation: false,

      setElo: (elo) => set({ elo }),

      updateElo: (puzzleRating, solved) => {
        const { elo } = get();
        const { newElo } = calculateElo(elo, puzzleRating, solved, K_ESTABLISHED);
        const expected = 1 / (1 + Math.pow(10, (puzzleRating - elo) / 400));
        const { recentDriftSamples } = get();
        const updatedSamples = [
          ...recentDriftSamples,
          { expected, actual: solved ? 1 : 0 },
        ].slice(-DRIFT_SAMPLE_SIZE);
        set({ elo: newElo, recentDriftSamples: updatedSamples });
        return newElo - elo;
      },

      updatePreElo: (puzzleRating, solved, elapsedMs = 0) => {
        const { preEloLow, preEloHigh, calibrationBounds, calibrationPendingConfirmation } = get();
        if (preEloLow === null || preEloHigh === null) return;

        // Pure binary search: clamp rating to current window, then move only one bound.
        const rating = Math.max(preEloLow, Math.min(preEloHigh, puzzleRating));
        let newLow  = solved ? rating     : preEloLow;
        let newHigh = solved ? preEloHigh : rating;

        // Time signal: adjust bound movement based on solve confidence.
        if (elapsedMs > 0) {
          if (solved && elapsedMs < CALIB_FAST_SOLVE_MS) {
            // Solved very quickly → clearly below their level, push lower bound up.
            newLow = Math.min(newLow + CALIB_FAST_SOLVE_BONUS, preEloHigh);
          } else if (!solved) {
            if (elapsedMs < CALIB_MISCLICK_MS) {
              // Failed almost instantly → likely misclick, soften upper bound drop.
              newHigh = Math.min(newHigh + CALIB_MISCLICK_CREDIT, preEloHigh);
            } else if (elapsedMs > CALIB_SLOW_FAIL_MS) {
              // Failed after a long attempt → engaged seriously, partial credit.
              newHigh = Math.min(newHigh + CALIB_SLOW_FAIL_CREDIT, preEloHigh);
            }
          }
        }

        const clampedLow  = Math.max(calibrationBounds.low,  newLow);
        const clampedHigh = Math.min(calibrationBounds.high, newHigh);

        if (clampedHigh - clampedLow < PRE_ELO_CONVERGENCE) {
          if (!calibrationPendingConfirmation) {
            // First time in convergence zone — hold for one more confirmation puzzle.
            set({ preEloLow: clampedLow, preEloHigh: clampedHigh, calibrationPendingConfirmation: true });
            return;
          }
          // Confirmation done — converge.
          const finalElo = Math.round((clampedLow + clampedHigh) / 2);
          set({ preEloLow: null, preEloHigh: null, elo: finalElo, recentDriftSamples: [], firstPuzzleRating: null, calibrationPendingConfirmation: false });
          return;
        }

        set({ preEloLow: clampedLow, preEloHigh: clampedHigh, calibrationPendingConfirmation: false });
      },

      checkRecalibrationNeeded: () => {
        const { preEloLow, lastActiveDate, recentDriftSamples } = get();
        if (preEloLow !== null) return false; // still calibrating

        if (lastActiveDate) {
          const daysSince = (Date.now() - new Date(lastActiveDate + 'T00:00:00').getTime()) / 86400000;
          if (daysSince >= RECALIBRATION_DAYS) return true;
        }

        if (recentDriftSamples.length >= DRIFT_SAMPLE_SIZE) {
          const deviations = recentDriftSamples.filter(
            ({ expected, actual }) => (expected > 0.5 && actual === 0) || (expected < 0.5 && actual === 1),
          ).length;
          if (deviations / recentDriftSamples.length > DRIFT_THRESHOLD) return true;
        }

        return false;
      },

      startRecalibration: () => {
        // Recalibration restarts Phase 2 (FSRS fine-tuning), not Phase 1 (binary search).
        // Keep preEloLow/High as null — no binary search, just reset drift tracking.
        set({ recentDriftSamples: [], calibrationPendingConfirmation: false });
      },

      setCalibrationBounds: (low, high) => set({ calibrationBounds: { low, high } }),

      clearFirstPuzzleRating: () => set({ firstPuzzleRating: null }),

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

        let { streakDays } = state;
        let lastActiveDate = state.lastActiveDate;
        if (lastActiveDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          streakDays = lastActiveDate === yesterday ? streakDays + 1 : 1;
          lastActiveDate = today;
        }
        const streakLongest = Math.max(state.streakLongest, streakDays);

        const monday = getMondayISO(today);
        const isNewWeek = state.weekStartDate !== monday;
        const weeklyPuzzleCount = solved
          ? (isNewWeek ? 1 : state.weeklyPuzzleCount + 1)
          : (isNewWeek ? 0 : state.weeklyPuzzleCount);

        const puzzlesCompleted = solved ? state.puzzlesCompleted + 1 : state.puzzlesCompleted;
        const puzzlesFailed    = !solved ? state.puzzlesFailed + 1 : state.puzzlesFailed;

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

        const currentElo = get().elo;
        const eloHistory = [...state.eloHistory];
        if (eloHistory.length === 0 || eloHistory[eloHistory.length - 1].date !== today) {
          eloHistory.push({ date: today, elo: currentElo });
          if (eloHistory.length > 30) eloHistory.shift();
        } else {
          eloHistory[eloHistory.length - 1] = { date: today, elo: currentElo };
        }

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
      setBoardTheme: (theme) => set({ boardTheme: theme }),
      setPieceSet: (s) => set({ pieceSet: s }),

      completeOnboarding: (levelElo, theme, pieces, levelKey) => {
        const { calibrationBounds } = get();
        const clampedTarget = Math.max(calibrationBounds.low, Math.min(calibrationBounds.high, levelElo));
        const startLow  = Math.max(calibrationBounds.low,  clampedTarget - PRE_ELO_ONBOARDING_WINDOW);
        const startHigh = Math.min(calibrationBounds.high, clampedTarget + PRE_ELO_ONBOARDING_WINDOW);
        set({
          boardTheme: theme,
          pieceSet: pieces,
          onboardingCompleted: true,
          declaredLevel: levelKey,
          firstPuzzleRating: clampedTarget,
          preEloLow:       startLow,
          preEloHigh:      startHigh,
          preEloStartLow:  startLow,
          preEloStartHigh: startHigh,
        });
      },

      setGdprConsent: (analytics) => set({
        gdprConsentDate: new Date().toISOString(),
        analyticsConsent: analytics,
      }),
      setPremium: (value) => set({ isPremium: value }),
      setPremiumUntil: (date) => set({ premiumUntil: date }),

      hydrate: (profile) => set({
        elo: profile.elo,
        preEloLow:  profile.preEloLow  ?? (profile.isCalibrated ? null : PRE_ELO_LOWER),
        preEloHigh: profile.preEloHigh ?? (profile.isCalibrated ? null : PRE_ELO_UPPER),
        streakDays: profile.streakCurrent,
        streakLongest: profile.streakLongest,
        isPremium: profile.isPremium,
      }),

      reset: () => set({
        elo: 800,
        preEloLow: PRE_ELO_LOWER,
        preEloHigh: PRE_ELO_UPPER,
        preEloStartLow: PRE_ELO_LOWER,
        preEloStartHigh: PRE_ELO_UPPER,
        recentDriftSamples: [],
        declaredLevel: null,
        firstPuzzleRating: null,
        calibrationBounds: { low: PRE_ELO_LOWER, high: PRE_ELO_UPPER },
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
        calibrationPendingConfirmation: false,
        // GDPR no se resetea al hacer logout
      }),
    }),
    {
      name: 'user-store',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 1) {
          const wasCalibrated = state.isCalibrated as boolean | undefined;
          return {
            ...state,
            preEloLow:       wasCalibrated ? null : PRE_ELO_LOWER,
            preEloHigh:      wasCalibrated ? null : PRE_ELO_UPPER,
            preEloStartLow:  PRE_ELO_LOWER,
            preEloStartHigh: PRE_ELO_UPPER,
            recentDriftSamples: [],
            declaredLevel: null,
            firstPuzzleRating: null,
            calibrationBounds: { low: PRE_ELO_LOWER, high: PRE_ELO_UPPER },
          };
        }
        if (version < 2) {
          return {
            ...state,
            preEloStartLow:  (state.preEloLow  as number | null) ?? PRE_ELO_LOWER,
            preEloStartHigh: (state.preEloHigh as number | null) ?? PRE_ELO_UPPER,
          };
        }
        return state;
      },
      partialize: (state) => ({
        elo: state.elo,
        preEloLow: state.preEloLow,
        preEloHigh: state.preEloHigh,
        preEloStartLow: state.preEloStartLow,
        preEloStartHigh: state.preEloStartHigh,
        recentDriftSamples: state.recentDriftSamples,
        declaredLevel: state.declaredLevel,
        firstPuzzleRating: state.firstPuzzleRating,
        calibrationBounds: state.calibrationBounds,
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
        boardTheme: state.boardTheme,
        pieceSet: state.pieceSet,
        onboardingCompleted: state.onboardingCompleted,
      }),
    },
  ),
);
