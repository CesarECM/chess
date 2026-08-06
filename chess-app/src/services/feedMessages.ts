import { MILESTONE_THRESHOLDS, RANK_THRESHOLDS, SESSION_MANUAL_MIN_CORRECT } from '@/constants';
import type { EloSnapshot } from '@/stores/useUserStore';
import type { MessageType, ProgressMessage } from '@/types';

const CALIBRATION_TYPES = new Set<MessageType>([
  'calibration_start', 'calibration_insight', 'calibration_midpoint', 'calibration_complete',
]);

// Always shown — bypasses session message cap
const ALWAYS_SHOW_TYPES = new Set<MessageType>([
  'session_gate_reached',
]);

const FEATURE_INTRO_TYPES = new Set<MessageType>([
  'reino_crown_first', 'reino_crystal_first', 'liga_intro',
]);

const MESSAGE_PRIORITY: Record<MessageType, number> = {
  session_gate_reached:   110,
  session_progress_nudge: 105,
  rank_up:             100,
  personal_best_elo:   90,
  milestone_solved:    80,
  medal:               70,
  reino_crown_first:   60,
  reino_crystal_first: 60,
  liga_intro:          60,
  perfect_run_clean:   50,
  perfect_run:         45,
  comeback:            40,
  session_elo_gain:    35,
  fsrs_mastered:       30,
  fsrs_first_review:   25,
  fsrs_relearned:      20,
  fsrs_review_session: 15,
  streak:              10,
  weekly_summary:      10,
  recalibration_streak: 5,
  calibration_start:   0,
  calibration_insight: 0,
  calibration_midpoint: 0,
  calibration_complete: 0,
};

export interface PuzzleEventSnapshot {
  // User state before/after
  eloBefore:         number;
  eloAfter:          number;
  eloAllTimeMax:     number;   // true historical max, used for personal_best_elo check
  completedBefore:   number;
  completedAfter:    number;
  medalsBefore:      string[];
  medalsAfter:       string[];
  eloHistoryBefore:  EloSnapshot[];
  // Session state before increment
  sessionPuzzleCountBefore:       number;
  consecutiveSolvedBefore:        number;
  consecutiveFailedBefore:        number;
  consecutiveSolvedAfter:         number;
  consecutiveCleanSolvedBefore:   number;
  consecutiveCleanSolvedAfter:    number;
  sessionStartElo:                number;
  sessionEloGainShown:            boolean;
  sessionPerfectRun5Shown:        boolean;
  sessionPerfectRun10Shown:       boolean;
  sessionCleanRun5Shown:          boolean;
  sessionCleanRun10Shown:         boolean;
  sessionGateMessageShown:        boolean;
  sessionFirstAttemptSolvedCountAfter: number;
  sessionNudgeShown:              boolean;
  sessionNudgeThreshold:          number;
  // FSRS state before this review
  fsrsStateBefore:            number;   // 0=New 1=Learning 2=Review 3=Relearning
  fsrsRepsBefore:             number;
  fsrsStabilityBefore:        number;
  fsrsStabilityAfter:         number;
  fsrsReviewsInSessionBefore: number;
  sessionFsrsReview5Shown:    boolean;
  // Reino snapshots (before/after puzzle)
  totalCrownsBefore:          number;
  totalCrownsAfter:           number;
  crystalsBefore:             number;
  crystalsAfter:              number;
  weeklyPuzzleCountBefore:    number;
  weeklyPuzzleCountAfter:     number;
  // Dosification context
  seenMessageTypes:           string[];
  sessionMessageCount:        number;
  lastMessagePuzzleCount:     number;
  sessionPuzzleCountAfter:    number;
}

export function detectPuzzleEvents(s: PuzzleEventSnapshot): ProgressMessage[] {
  const messages: ProgressMessage[] = [];

  // 1. Milestone de puzzles resueltos
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (s.completedBefore < threshold && s.completedAfter >= threshold) {
      messages.push({
        id:      `milestone_${threshold}`,
        kind:    'progress',
        type:    'milestone_solved',
        payload: { count: threshold },
      });
    }
  }

  // 2. Subida de rango ELO
  for (const rank of RANK_THRESHOLDS) {
    if (s.eloBefore < rank.elo && s.eloAfter >= rank.elo) {
      messages.push({
        id:      `rank_up_${rank.rankKey}`,
        kind:    'progress',
        type:    'rank_up',
        payload: { rankKey: rank.rankKey, elo: s.eloAfter, piece: rank.piece },
      });
    }
  }

  // 3. Nuevas medallas
  const newMedals = s.medalsAfter.filter((m) => !s.medalsBefore.includes(m));
  for (const medalId of newMedals) {
    messages.push({
      id:      `medal_${medalId}`,
      kind:    'progress',
      type:    'medal',
      payload: { medalId },
    });
  }

  // 4. Récord personal de ELO (usa all-time max para evitar falsos positivos con historial de 30d)
  if (s.eloAfter > s.eloAllTimeMax) {
    messages.push({
      id:      `personal_best_elo_${s.eloAfter}`,
      kind:    'progress',
      type:    'personal_best_elo',
      payload: { elo: s.eloAfter },
    });
  }

  // 5. Racha perfecta en sesión (5 ó 10 seguidos)
  if (!s.sessionPerfectRun5Shown && s.consecutiveSolvedAfter === 5) {
    messages.push({
      id:      'perfect_run_5',
      kind:    'progress',
      type:    'perfect_run',
      payload: { count: 5 },
    });
  }
  if (!s.sessionPerfectRun10Shown && s.consecutiveSolvedAfter === 10) {
    messages.push({
      id:      'perfect_run_10',
      kind:    'progress',
      type:    'perfect_run',
      payload: { count: 10 },
    });
  }

  // 5b. Racha limpia en sesión (primer intento, sin pista, sin error)
  if (!s.sessionCleanRun5Shown && s.consecutiveCleanSolvedAfter === 5) {
    messages.push({
      id:      'perfect_run_clean_5',
      kind:    'progress',
      type:    'perfect_run_clean',
      payload: { count: 5 },
    });
  }
  if (!s.sessionCleanRun10Shown && s.consecutiveCleanSolvedAfter === 10) {
    messages.push({
      id:      'perfect_run_clean_10',
      kind:    'progress',
      type:    'perfect_run_clean',
      payload: { count: 10 },
    });
  }

  // 6. Comeback: tras ≥3 fallos seguidos, acumulas 3 correctos
  if (s.consecutiveFailedBefore >= 3 && s.consecutiveSolvedAfter === 3) {
    messages.push({
      id:      `comeback_${Date.now()}`,
      kind:    'progress',
      type:    'comeback',
      payload: { failedBefore: s.consecutiveFailedBefore, bodyIndex: Math.floor(Math.random() * 10) },
    });
  }

  // 7. Ganancia de ELO en sesión (una vez, ≥10 puzzles, ≥20 ELO ganados)
  const sessionEloGain = s.eloAfter - s.sessionStartElo;
  if (!s.sessionEloGainShown && s.sessionPuzzleCountBefore >= 9 && sessionEloGain >= 20) {
    messages.push({
      id:      'session_elo_gain',
      kind:    'progress',
      type:    'session_elo_gain',
      payload: { gained: sessionEloGain, bodyIndex: Math.floor(Math.random() * 10) },
    });
  }

  // 8. First scheduled FSRS review (state=Review, first return after initial learning)
  if (s.fsrsStateBefore === 2 && s.fsrsRepsBefore === 1) {
    messages.push({
      id:      `fsrs_first_review_${Date.now()}`,
      kind:    'progress',
      type:    'fsrs_first_review',
      payload: { bodyIndex: Math.floor(Math.random() * 10) },
    });
  }

  // 9. Pattern mastered — stability crosses 21 days (long-term memory threshold)
  if (s.fsrsStabilityAfter >= 21 && s.fsrsStabilityBefore < 21) {
    messages.push({
      id:      `fsrs_mastered_${Math.round(s.fsrsStabilityAfter)}_${Date.now()}`,
      kind:    'progress',
      type:    'fsrs_mastered',
      payload: { days: Math.round(s.fsrsStabilityAfter), bodyIndex: Math.floor(Math.random() * 30) },
    });
  }

  // 10. Relearned after lapse (state=Relearning means ≥1 previous lapse)
  if (s.fsrsStateBefore === 3) {
    messages.push({
      id:      `fsrs_relearned_${Date.now()}`,
      kind:    'progress',
      type:    'fsrs_relearned',
      payload: { bodyIndex: Math.floor(Math.random() * 10) },
    });
  }

  // 11. FSRS review session milestone: 5 successful reviews in one session
  const fsrsReviewsAfter = s.fsrsReviewsInSessionBefore + (s.fsrsStateBefore >= 2 ? 1 : 0);
  if (!s.sessionFsrsReview5Shown && fsrsReviewsAfter === 5) {
    messages.push({
      id:      'fsrs_review_session_5',
      kind:    'progress',
      type:    'fsrs_review_session',
      payload: { count: 5 },
    });
  }

  // 12. First crown ever (onboarding feature intro — one-time)
  if (s.totalCrownsBefore === 0 && s.totalCrownsAfter >= 1 && !s.seenMessageTypes.includes('reino_crown_first')) {
    messages.push({
      id:      'reino_crown_first',
      kind:    'progress',
      type:    'reino_crown_first',
      payload: {},
    });
  }

  // 13. First crystal ever (onboarding feature intro — one-time)
  if (s.crystalsBefore === 0 && s.crystalsAfter >= 1 && !s.seenMessageTypes.includes('reino_crystal_first')) {
    messages.push({
      id:      'reino_crystal_first',
      kind:    'progress',
      type:    'reino_crystal_first',
      payload: {},
    });
  }

  // 14. Liga intro: first week with ≥5 puzzles solved (one-time)
  if (s.weeklyPuzzleCountBefore < 5 && s.weeklyPuzzleCountAfter >= 5 && !s.seenMessageTypes.includes('liga_intro')) {
    messages.push({
      id:      'liga_intro',
      kind:    'progress',
      type:    'liga_intro',
      payload: {},
    });
  }

  // 15. Session gate reached: total clean solves just crossed the threshold
  if (
    !s.sessionGateMessageShown &&
    s.sessionFirstAttemptSolvedCountAfter >= SESSION_MANUAL_MIN_CORRECT
  ) {
    messages.push({
      id:      'session_gate_reached',
      kind:    'progress',
      type:    'session_gate_reached',
      payload: {
        firstQualityIntro: !s.seenMessageTypes.includes('gate_quality_intro'),
      },
    });
  }

  // 16. Session progress nudge: random milestone between solve 3–5, before gate, non-calibrating
  if (
    !s.sessionNudgeShown &&
    s.sessionFirstAttemptSolvedCountAfter >= s.sessionNudgeThreshold &&
    s.sessionFirstAttemptSolvedCountAfter < SESSION_MANUAL_MIN_CORRECT
  ) {
    messages.push({
      id:      `session_progress_nudge_${Date.now()}`,
      kind:    'progress',
      type:    'session_progress_nudge',
      payload: {
        count:     s.sessionFirstAttemptSolvedCountAfter,
        bodyIndex: Math.floor(Math.random() * 3),
      },
    });
  }

  return messages;
}

export function applyDosification(
  messages: ProgressMessage[],
  params: {
    sessionMessageCount:    number;
    lastMessagePuzzleCount: number;
    sessionPuzzleCountAfter: number;
  },
): ProgressMessage[] {
  const calibMessages   = messages.filter((m) => CALIBRATION_TYPES.has(m.type));
  const alwaysMessages  = messages.filter((m) => ALWAYS_SHOW_TYPES.has(m.type));
  const regularMessages = messages.filter((m) => !CALIBRATION_TYPES.has(m.type) && !ALWAYS_SHOW_TYPES.has(m.type));

  if (regularMessages.length === 0 && alwaysMessages.length === 0) return calibMessages;

  // Session cap: max 3 non-calibration MessageCards per session (gate messages bypass this)
  if (params.sessionMessageCount >= 3) return [...calibMessages, ...alwaysMessages];

  const puzzlesSinceLast = params.sessionPuzzleCountAfter - params.lastMessagePuzzleCount;

  const eligible = regularMessages.filter((m) => {
    const isIntro    = FEATURE_INTRO_TYPES.has(m.type);
    const minCooldown = isIntro ? 10 : 3;
    return puzzlesSinceLast >= minCooldown;
  });

  if (eligible.length === 0) return [...calibMessages, ...alwaysMessages];

  eligible.sort((a, b) => (MESSAGE_PRIORITY[b.type] ?? 0) - (MESSAGE_PRIORITY[a.type] ?? 0));
  return [...calibMessages, ...alwaysMessages, eligible[0]];
}

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export function detectSessionStartEvents(params: {
  streakDays:       number;
  weekStartDate:    string | null;
  weeklyPuzzleCount: number;
  elo:              number;
}): ProgressMessage[] {
  const messages: ProgressMessage[] = [];

  // Racha activa al iniciar sesión (≥2 días)
  if (params.streakDays >= 2) {
    messages.push({
      id:      'streak_session',
      kind:    'progress',
      type:    'streak',
      payload: { days: params.streakDays, bodyIndex: Math.floor(Math.random() * 10) },
    });
  }

  // Resumen semanal: primer puzzle de una nueva semana (y hubo puzzles la semana pasada)
  if (params.weekStartDate !== null && params.weeklyPuzzleCount > 0) {
    const today         = new Date().toISOString().split('T')[0];
    const currentMonday = getMondayISO(today);
    if (params.weekStartDate !== currentMonday) {
      messages.push({
        id:      'weekly_summary_session',
        kind:    'progress',
        type:    'weekly_summary',
        payload: { puzzles: params.weeklyPuzzleCount, elo: params.elo },
      });
    }
  }

  return messages;
}
