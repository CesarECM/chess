import type { ItemType } from '@/constants/reino';
import type { ChestType } from '@/types';

export const CHEST_SLOT_MAX        = 3;
export const CHEST_RARE_PROBABILITY = 0.2;

export interface ChestCost {
  bronze: number;
  silver: number;
  gold:   number;
}

export interface ChestReward {
  cosmetics:   ItemType[];  // item types; actual item resolved at open time
  lifeBonus:   number;      // immediate +lives
  streakFreeze: number;     // streak freeze days
}

export interface ChestDef {
  type:            ChestType;
  emoji:           string;
  cost:            ChestCost;
  timerHours:      number;
  reducePerHour:   number;  // crystals to cut 1h off timer
  openNowCrystals: (hoursRemaining: number) => number;
  commonReward:    ChestReward;
  rareReward:      ChestReward;
}

export const CHEST_DEFS: Record<ChestType, ChestDef> = {
  wood: {
    type:            'wood',
    emoji:           '🪵',
    cost:            { bronze: 15, silver: 3, gold: 0 },
    timerHours:      2,
    reducePerHour:   2,
    openNowCrystals: (h) => Math.ceil(h * 2),
    commonReward:    { cosmetics: ['medal'],              lifeBonus: 1, streakFreeze: 0 },
    rareReward:      { cosmetics: ['painting'],           lifeBonus: 0, streakFreeze: 1 },
  },
  silver: {
    type:            'silver',
    emoji:           '🥈',
    cost:            { bronze: 0, silver: 8, gold: 2 },
    timerHours:      4,
    reducePerHour:   2,
    openNowCrystals: (h) => Math.ceil(h * 2),
    commonReward:    { cosmetics: ['painting', 'sculpture'], lifeBonus: 1, streakFreeze: 0 },
    rareReward:      { cosmetics: ['trophy'],              lifeBonus: 0, streakFreeze: 1 },
  },
  gold: {
    type:            'gold',
    emoji:           '👑',
    cost:            { bronze: 0, silver: 5, gold: 4 },
    timerHours:      8,
    reducePerHour:   2,
    openNowCrystals: (h) => Math.ceil(h * 2),
    commonReward:    { cosmetics: ['sculpture', 'trophy'], lifeBonus: 0, streakFreeze: 1 },
    rareReward:      { cosmetics: ['board'],              lifeBonus: 0, streakFreeze: 2 },
  },
};
