export interface Medal {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

export const MEDALS: Medal[] = [
  // ── Puzzle milestones ──────────────────────────────────────────
  { id: 'first_solve',        emoji: '🏁', label: 'Primer paso',     description: 'Resolver tu primer puzzle' },
  { id: 'ten_solves',         emoji: '🔢', label: 'En racha',        description: 'Resolver 10 puzzles' },
  { id: 'hundred_solves',     emoji: '⭐', label: 'Centurión',       description: 'Resolver 100 puzzles' },
  { id: 'five_hundred_solves',emoji: '💎', label: 'Élite',           description: 'Resolver 500 puzzles' },

  // ── Streak milestones ──────────────────────────────────────────
  { id: 'streak_3',  emoji: '🔥', label: 'Calentando',      description: '3 días consecutivos' },
  { id: 'streak_7',  emoji: '🌟', label: 'Semana de fuego', description: '7 días consecutivos' },
  { id: 'streak_30', emoji: '🏆', label: 'Imparable',       description: '30 días consecutivos' },

  // ── ELO rank promotions ────────────────────────────────────────
  { id: 'rank_knight', emoji: '♞', label: 'Caballo', description: 'Alcanzar 800 ELO' },
  { id: 'rank_bishop', emoji: '♝', label: 'Alfil',   description: 'Alcanzar 1200 ELO' },
  { id: 'rank_rook',   emoji: '♜', label: 'Torre',   description: 'Alcanzar 1500 ELO' },
  { id: 'rank_queen',  emoji: '♛', label: 'Reina',   description: 'Alcanzar 1800 ELO' },
  { id: 'rank_king',   emoji: '♚', label: 'Rey',     description: 'Alcanzar 2200 ELO' },

  // ── Tactic mastery ─────────────────────────────────────────────
  { id: 'ten_mates', emoji: '💀', label: 'Jaque mate', description: '10 puzzles de mate' },
  { id: 'ten_forks', emoji: '⚔️', label: 'Doblón',    description: '10 puzzles de horquilla' },
  { id: 'ten_pins',  emoji: '📌', label: 'Clavado',   description: '10 puzzles de pin' },
];

export const MEDAL_MAP = Object.fromEntries(MEDALS.map((m) => [m.id, m]));
