import type { TacticType } from '@/types';

// ── Hall IDs ───────────────────────────────────────────────────────────────────
export type HallId =
  | 'pin_tower'
  | 'fork_hall'
  | 'sacrifice_vault'
  | 'mate_chamber'
  | 'defense_wall'
  | 'crystal_hall';

// ── Item types ─────────────────────────────────────────────────────────────────
export type ItemType   = 'medal' | 'painting' | 'sculpture' | 'trophy' | 'board' | 'special';
export type ItemSource = 'hall_level' | 'seasonal' | 'league';

// Items unlocked per level (index 0 = level 1)
export const HALL_LEVEL_ITEMS: ItemType[] = [
  'medal',
  'painting',
  'sculpture',
  'trophy',
  'board',
];

// ── Hall thresholds ────────────────────────────────────────────────────────────
export const HALL_THRESHOLDS         = [5, 20, 50, 100, 200] as const;
export const CRYSTAL_HALL_THRESHOLDS = [5, 15, 35, 70, 120, 180, 250] as const;

// ── Hall definitions ───────────────────────────────────────────────────────────
export interface HallDef {
  id:         HallId;
  tactics:    TacticType[];
  maxLevel:   5 | 7;
  thresholds: readonly number[];
  isCrystal?: boolean;
}

export const HALLS: HallDef[] = [
  {
    id:         'pin_tower',
    tactics:    ['pin', 'skewer'],
    maxLevel:   5,
    thresholds: HALL_THRESHOLDS,
  },
  {
    id:         'fork_hall',
    tactics:    ['fork'],
    maxLevel:   5,
    thresholds: HALL_THRESHOLDS,
  },
  {
    id:         'sacrifice_vault',
    tactics:    ['other'],
    maxLevel:   5,
    thresholds: HALL_THRESHOLDS,
  },
  {
    id:         'mate_chamber',
    tactics:    ['mate'],
    maxLevel:   5,
    thresholds: HALL_THRESHOLDS,
  },
  {
    id:         'defense_wall',
    tactics:    ['deflection', 'discoveredAttack'],
    maxLevel:   5,
    thresholds: HALL_THRESHOLDS,
  },
  {
    id:         'crystal_hall',
    tactics:    ['mate', 'fork', 'pin', 'skewer', 'discoveredAttack', 'deflection', 'other'],
    maxLevel:   7,
    thresholds: CRYSTAL_HALL_THRESHOLDS,
    isCrystal:  true,
  },
];

// ── Tactic → hall mapping ──────────────────────────────────────────────────────
export const TACTIC_TO_HALL: Partial<Record<TacticType, HallId>> = {
  pin:              'pin_tower',
  skewer:           'pin_tower',
  fork:             'fork_hall',
  other:            'sacrifice_vault',
  mate:             'mate_chamber',
  deflection:       'defense_wall',
  discoveredAttack: 'defense_wall',
};

export function getHallForTactic(tactic: TacticType): HallId | null {
  return TACTIC_TO_HALL[tactic] ?? null;
}

// ── Lives constants ────────────────────────────────────────────────────────────
export const LIVES_BASE          = 5;
export const LIVES_MAX_CAP       = 10;
export const CRYSTALS_PER_LIFE   = 5;   // +1 max_life every 5 crystals (up to cap)
export const LIFE_RECHARGE_HOURS = 0.5; // 1 life recharges every 30 min

// ── Speed points ───────────────────────────────────────────────────────────────
export function computeSpeedPoints(percentile: number): 0 | 1 | 2 | 3 {
  if (percentile >= 70) return 3;
  if (percentile >= 60) return 2;
  if (percentile >= 50) return 1;
  return 0;
}

// ── Crown colors ───────────────────────────────────────────────────────────────
export const CROWN_COLORS = {
  gold:   '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
} as const;
