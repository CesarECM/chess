export interface Medal {
  id: string;
  emoji: string;
}

export const MEDALS: Medal[] = [
  // ── Puzzle milestones ──────────────────────────────────────────
  { id: 'first_solve',         emoji: '🏁' },
  { id: 'ten_solves',          emoji: '🔢' },
  { id: 'hundred_solves',      emoji: '⭐' },
  { id: 'five_hundred_solves', emoji: '💎' },

  // ── Streak milestones ──────────────────────────────────────────
  { id: 'streak_3',  emoji: '🔥' },
  { id: 'streak_7',  emoji: '🌟' },
  { id: 'streak_30', emoji: '🏆' },

  // ── ELO rank promotions ────────────────────────────────────────
  { id: 'rank_knight', emoji: '♞' },
  { id: 'rank_bishop', emoji: '♝' },
  { id: 'rank_rook',   emoji: '♜' },
  { id: 'rank_queen',  emoji: '♛' },
  { id: 'rank_king',   emoji: '♚' },

  // ── Tactic mastery ─────────────────────────────────────────────
  { id: 'ten_mates', emoji: '💀' },
  { id: 'ten_forks', emoji: '⚔️' },
  { id: 'ten_pins',  emoji: '📌' },
];

export const MEDAL_MAP = Object.fromEntries(MEDALS.map((m) => [m.id, m]));
