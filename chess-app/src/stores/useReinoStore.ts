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
import type { ChestType, ChestSlot, ChestContents, CollectedItem } from '@/types';
import { CHEST_DEFS, CHEST_SLOT_MAX, CHEST_RARE_PROBABILITY } from '@/constants/chests';
import { useUserStore } from '@/stores/useUserStore';
import { analytics } from '@/services/analytics';

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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
  chests:              ChestSlot[];
  collectedItems:      CollectedItem[];
}

interface ReinoActions {
  addCrown:              (type: CrownType, puzzleId: string) => void;
  addCrystal:            (puzzleId: string) => void;
  addSpeedPoints:        (points: number, percentile: number) => void;
  loseLife:              () => void;
  gainLife:              (source: 'ad' | 'crystal' | 'recharge' | 'chest') => void;
  redeemCrystalForLife:  () => boolean;
  rechargeLives:         () => void;
  incrementHallProgress: (hallId: HallId, puzzleId: string) => void;
  reset:                 () => void;
  // ── Chests (logic in Sprint 2) ──────────────────────────────────────────────
  buyChest:            (type: ChestType) => boolean;
  openChest:           (id: string, earlyOpen?: boolean) => ChestContents | null;
  reduceChestTimer:    (id: string, crystalsToSpend: number) => boolean;
  checkUnlockedChests: () => ChestSlot[];
}

const INITIAL_STATE: ReinoState = {
  crowns:              { gold: 0, silver: 0, bronze: 0 },
  crystals:            0,
  speedPointsToday:    0,
  speedPointsDate:     null,
  lives:               { current: LIVES_BASE, max: LIVES_BASE, lastRechargeAt: new Date().toISOString() },
  hallProgress:        {},
  crystalHallUnlocked: false,
  chests:              [],
  collectedItems:      [],
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

      gainLife: (source) => {
        set((s) => {
          if (s.lives.current >= s.lives.max) return s;
          const newCurrent = s.lives.current + 1;
          analytics.track('life_gained', { source, lives_after: newCurrent });
          return { lives: { ...s.lives, current: newCurrent } };
        });
      },

      redeemCrystalForLife: () => {
        const s = get();
        if (s.crystals < CRYSTALS_PER_LIFE || s.lives.current >= s.lives.max) return false;
        set((prev) => ({
          crystals: prev.crystals - CRYSTALS_PER_LIFE,
          lives:    { ...prev.lives, current: prev.lives.current + 1 },
        }));
        analytics.track('life_redeemed_crystals', { crystals_spent: CRYSTALS_PER_LIFE });
        return true;
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

      // ── Chests ────────────────────────────────────────────────────────────────

      buyChest: (type) => {
        const s   = get();
        const def = CHEST_DEFS[type];
        if (s.chests.length >= CHEST_SLOT_MAX) {
          analytics.track('chest_slot_full', { slots: s.chests.length });
          return false;
        }
        if (
          s.crowns.bronze < def.cost.bronze ||
          s.crowns.silver < def.cost.silver ||
          s.crowns.gold   < def.cost.gold
        ) return false;

        const now     = new Date();
        const unlockAt = new Date(now.getTime() + def.timerHours * 3_600_000).toISOString();
        const slot: ChestSlot = {
          id:          makeId(),
          type,
          purchasedAt: now.toISOString(),
          unlockAt,
        };

        set((prev) => ({
          crowns: {
            bronze: prev.crowns.bronze - def.cost.bronze,
            silver: prev.crowns.silver - def.cost.silver,
            gold:   prev.crowns.gold   - def.cost.gold,
          },
          chests: [...prev.chests, slot],
        }));

        analytics.track('chest_earned', {
          chest_type:     type,
          slots_occupied: s.chests.length + 1,
          cost_bronze:    def.cost.bronze,
          cost_silver:    def.cost.silver,
          cost_gold:      def.cost.gold,
        });
        return true;
      },

      openChest: (id, earlyOpen = false) => {
        const s    = get();
        const slot = s.chests.find((c) => c.id === id);
        if (!slot) return null;
        if (new Date(slot.unlockAt).getTime() > Date.now()) return null;

        const def    = CHEST_DEFS[slot.type];
        const isRare = Math.random() < CHEST_RARE_PROBABILITY;
        const reward = isRare ? def.rareReward : def.commonReward;

        const now   = new Date().toISOString();
        const items: CollectedItem[] = reward.cosmetics.map((type) => ({
          id:         makeId(),
          type,
          acquiredAt: now,
        }));

        // Apply life bonus (capped at current max by gainLife)
        for (let i = 0; i < reward.lifeBonus; i++) {
          get().gainLife('chest');
        }

        // Apply streak freezes via useUserStore
        for (let i = 0; i < reward.streakFreeze; i++) {
          useUserStore.getState().gainFreeze();
        }

        set((prev) => ({
          chests:         prev.chests.filter((c) => c.id !== id),
          collectedItems: [...prev.collectedItems, ...items],
        }));

        const contents: ChestContents = { isRare, items, lifeBonus: reward.lifeBonus, streakFreeze: reward.streakFreeze };

        const eventName = earlyOpen ? 'chest_opened_early' : 'chest_opened';
        analytics.track(eventName, {
          chest_type:    slot.type,
          is_rare:       isRare,
          life_bonus:    reward.lifeBonus,
          streak_freeze: reward.streakFreeze,
          cosmetics:     reward.cosmetics,
        });
        return contents;
      },

      reduceChestTimer: (id, crystalsToSpend) => {
        const s    = get();
        const slot = s.chests.find((c) => c.id === id);
        if (!slot) return false;
        if (s.crystals < crystalsToSpend || crystalsToSpend <= 0) return false;

        const def          = CHEST_DEFS[slot.type];
        const hoursToReduce = crystalsToSpend / def.reducePerHour;
        const currentUnlock = new Date(slot.unlockAt).getTime();
        const newUnlock     = Math.max(Date.now(), currentUnlock - hoursToReduce * 3_600_000);

        set((prev) => ({
          crystals: prev.crystals - crystalsToSpend,
          chests:   prev.chests.map((c) =>
            c.id === id ? { ...c, unlockAt: new Date(newUnlock).toISOString() } : c
          ),
        }));

        analytics.track('chest_timer_reduced', {
          chest_type:      slot.type,
          crystals_spent:  crystalsToSpend,
          hours_reduced:   hoursToReduce,
        });
        return true;
      },

      checkUnlockedChests: () => {
        const now = Date.now();
        return get().chests.filter((c) => new Date(c.unlockAt).getTime() <= now);
      },

      reset: () => set(INITIAL_STATE),
    }),
    {
      name:    'reino-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
