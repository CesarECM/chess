import { supabase } from '@/services/supabase';
import { loadAllLocalProgress } from '@/services/localProgress';
import { useAuthStore } from '@/stores/useAuthStore';

export interface FSRSProjection {
  dueToday: number;
  dueThisWeek: number;
  totalLearned: number;
}

export async function loadFSRSProjection(userId: string): Promise<FSRSProjection> {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + 7);

  const todayIso = endOfToday.toISOString();
  const weekIso  = endOfWeek.toISOString();

  if (useAuthStore.getState().isGuest) {
    const all = await loadAllLocalProgress();
    return {
      dueToday:     all.filter((p) => p.nextReviewAt <= todayIso).length,
      dueThisWeek:  all.filter((p) => p.nextReviewAt <= weekIso).length,
      totalLearned: all.filter((p) => p.repetitions > 0).length,
    };
  }

  const { data, error } = await supabase
    .from('user_puzzle_progress')
    .select('next_review_at, repetitions')
    .eq('user_id', userId);

  if (error || !data) return { dueToday: 0, dueThisWeek: 0, totalLearned: 0 };

  return {
    dueToday:     data.filter((r) => r.next_review_at <= todayIso).length,
    dueThisWeek:  data.filter((r) => r.next_review_at <= weekIso).length,
    totalLearned: data.filter((r) => r.repetitions > 0).length,
  };
}
