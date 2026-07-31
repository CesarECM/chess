import { MILESTONE_THRESHOLDS, RANK_THRESHOLDS } from '@/constants';
import type { EloSnapshot } from '@/stores/useUserStore';
import type { ProgressMessage } from '@/types';

export interface PuzzleEventSnapshot {
  // User state before/after
  eloBefore:         number;
  eloAfter:          number;
  completedBefore:   number;
  completedAfter:    number;
  medalsBefore:      string[];
  medalsAfter:       string[];
  eloHistoryBefore:  EloSnapshot[];
  // Session state before increment
  sessionPuzzleCountBefore:   number;
  consecutiveSolvedBefore:    number;
  consecutiveFailedBefore:    number;
  consecutiveSolvedAfter:     number;
  sessionStartElo:            number;
  sessionEloGainShown:        boolean;
  sessionPerfectRun5Shown:    boolean;
  sessionPerfectRun10Shown:   boolean;
  // FSRS state before this review
  fsrsStateBefore:            number;   // 0=New 1=Learning 2=Review 3=Relearning
  fsrsRepsBefore:             number;
  fsrsStabilityBefore:        number;
  fsrsStabilityAfter:         number;
  fsrsReviewsInSessionBefore: number;
  sessionFsrsReview5Shown:    boolean;
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

  // 4. Récord personal de ELO (requiere ≥2 días de historial)
  if (s.eloHistoryBefore.length >= 2) {
    const historicalMax = Math.max(...s.eloHistoryBefore.map((e) => e.elo));
    if (s.eloAfter > historicalMax) {
      messages.push({
        id:      `personal_best_elo_${s.eloAfter}`,
        kind:    'progress',
        type:    'personal_best_elo',
        payload: { elo: s.eloAfter },
      });
    }
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
      id:      `fsrs_mastered_${Math.round(s.fsrsStabilityAfter)}`,
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

  return messages;
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
