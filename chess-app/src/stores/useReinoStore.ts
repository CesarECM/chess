import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CrownType } from '@/services/fsrs';
import {
  LIVES_BASE,
  LIVES_MAX_CAP,
  CRYSTALS_PER_LIFE,
  LIFE_RECHARGE_HOURS,
  HALL_THRESHOLDS,
  CRYSTAL_HALL_THRESHOLDS,
  HALLS,
  type HallId,
} from '@/constants/reino';
import { analytics } from '@/services/analytics';

export interface HallProgressEntry {
  level: number;
  puzzlesCount: number;
}

interface ReinoState {
  crowns:              { gold: number; silver: number; bronze: number };
  crystals:            number;
  speedPointsToday:    number;
  speedPointsDate:     string | null;  // YYYY-MM-DD, resets daily
  lives:               { current: number; max: number; lastRechargeAt: string };
  hallProgress:        Partial<Record<HallId, HallProgressEntry>>;
  crystalHallUnlocked: boolean;
}

interface ReinoActions {
  addCrown:              (type: CrownType, puzzleId: string) => void;
  addCrystal:            (puzzleId: string) => void;
  addSpeedPoints:        (points: number, percentile: number) => void;
  loseLife:              () => void;
  rechargeLives:         () => void;
  incrementHallProgress: (hallId: HallId, puzzleId: string) => void;
  reset:                 () => void;
}

const INITIAL_STATE: ReinoState = {
  crowns:              { gold: 0, silver: 0, bronze: 0 },
  crystals:            0,
  speedPointsToday:    0,
  speedPointsDate:     null,
  lives:               { current: LIVES_BASE, max: LIVES_BASE, lastRechargeAt: new Date().toISOString() },
  hallProgress:        {},
  crystalHallUnlocked: false,
};

export const useReinoStore = create<ReinoState & ReinoActions>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      addCrown: (type, puzzleId) => {
        if (!type) return;
        set((s) => ({
          crowns: { ...s.crowns, [type]: s.crowns[type] + 1 },
        }));
        analytics.track('crown_earned', {
          puzzle_id:  puzzleId,
          crown_type: type,
          is_gold:    type === 'gold',
          amount:     1,
        });
      },

      addCrystal: (puzzleId) => {
        set((s) => {
          const newCrystals       = s.crystals + 1;
          const prevLifeBonuses   = Math.floor(s.crystals / CRYSTALS_PER_LIFE);
          const newLifeBonuses    = Math.floor(newCrystals / CRYSTALS_PER_LIFE);
          const maxLifeIncrease   = newLifeBonuses - prevLifeBonuses;
          const newMax            = Math.min(LIVES_MAX_CAP, s.lives.max + maxLifeIncrease);
          const didUnlock         = !s.crystalHallUnlocked && newMax >= LIVES_MAX_CAP;

          if (didUnlock) {
            analytics.track('crystal_hall_unlocked', {});
          }
          analytics.track('crystal_earned', {
            crystals_total:  newCrystals,
            max_lives_after: newMax,
          });

          return {
            crystals:            newCrystals,
            lives:               { ...s.lives, max: newMax },
            crystalHallUnlocked: s.crystalHallUnlocked || didUnlock,
          };
        });
      },

      addSpeedPoints: (points, percentile) => {
        if (points <= 0) return;
        const today = new Date().toISOString().split('T')[0];
        set((s) => ({
          speedPointsToday: s.speedPointsDate !== today ? points : s.speedPointsToday + points,
          speedPointsDate:  today,
        }));
        analytics.track('speed_points_earned', { points, percentile });
      },

      loseLife: () => {
        set((s) => {
          const newCurrent = Math.max(0, s.lives.current - 1);
          analytics.track('life_lost', { lives_remaining: newCurrent });
          return { lives: { ...s.lives, current: newCurrent } };
        });
      },

      rechargeLives: () => {
        set((s) => {
          if (s.lives.current >= s.lives.max) return s;
          const now           = new Date();
          const last          = new Date(s.lives.lastRechargeAt);
          const hoursElapsed  = (now.getTime() - last.getTime()) / 3_600_000;
          const rechargeCount = Math.floor(hoursElapsed / LIFE_RECHARGE_HOURS);
          if (rechargeCount <= 0) return s;
          const newCurrent = Math.min(s.lives.max, s.lives.current + rechargeCount);
          return {
            lives: { ...s.lives, current: newCurrent, lastRechargeAt: now.toISOString() },
          };
        });
      },

      incrementHallProgress: (hallId, _puzzleId) => {
        const hall = HALLS.find((h) => h.id === hallId);
        if (!hall) return;

        set((s) => {
          const prev        = s.hallProgress[hallId] ?? { level: 0, puzzlesCount: 0 };
          const newCount    = prev.puzzlesCount + 1;
          const thresholds  = hall.isCrystal ? [...CRYSTAL_HALL_THRESHOLDS] : [...HALL_THRESHOLDS];
          const newLevel    = thresholds.filter((t) => newCount >= t).length;
          const levelUp     = newLevel !== prev.level;

          if (levelUp) {
            analytics.track('hall_progress', {
              hall_id:      hallId,
              level_before: prev.level,
              level_after:  newLevel,
            });
            if (newLevel >= hall.maxLevel) {
              analytics.track('hall_completed', { hall_id: hallId });
            }
            const itemTypes  = ['medal', 'painting', 'sculpture', 'trophy', 'board'];
            const itemType   = itemTypes[newLevel - 1] ?? 'special';
            const itemId     = `${hallId}_level_${newLevel}`;
            analytics.track('cosmetic_unlocked', {
              item_id:       itemId,
              item_type:     itemType,
              unlock_method: 'hall_level',
            });
          }

          return {
            hallProgress: {
              ...s.hallProgress,
              [hallId]: { level: newLevel, puzzlesCount: newCount },
            },
          };
        });
      },

      reset: () => set(INITIAL_STATE),
    }),
    {
      name:    'reino-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
