import { supabase } from './supabase';
import { useLigaStore } from '@/stores/useLigaStore';
import type { LeagueInfo, LeagueMember, PreviousLigaResult } from '@/stores/useLigaStore';
import { analytics } from './analytics';

// Fixed ELO brackets — must match DB and league assignment logic
const ELO_BRACKETS = [
  { min: 0,    max: 799  },
  { min: 800,  max: 999  },
  { min: 1000, max: 1199 },
  { min: 1200, max: 1499 },
  { min: 1500, max: 9999 },
] as const;

function getBracket(elo: number) {
  return ELO_BRACKETS.find((b) => elo >= b.min && elo <= b.max) ?? ELO_BRACKETS[0];
}

function getCurrentWeekBounds(): { weekStart: string; weekEnd: string } {
  const now  = new Date();
  const day  = now.getUTCDay(); // 0 = Sunday
  const daysToSunday = day === 0 ? 0 : 7 - day;
  const end  = new Date(now);
  end.setUTCDate(now.getUTCDate() + daysToSunday);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

export async function assignToLeagueIfNeeded(
  userId: string,
  elo: number,
): Promise<void> {
  if (!userId) return;
  const { weekStart, weekEnd } = getCurrentWeekBounds();
  const bracket = getBracket(elo);

  // Find or create a league for this bracket + week
  let { data: league } = await supabase
    .from('leagues')
    .select('id')
    .eq('elo_min', bracket.min)
    .eq('elo_max', bracket.max)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (!league) {
    const { data: created } = await supabase
      .from('leagues')
      .insert({ elo_min: bracket.min, elo_max: bracket.max, week_start: weekStart, week_end: weekEnd })
      .select('id')
      .single();
    league = created;
  }
  if (!league) return;

  await supabase
    .from('league_members')
    .upsert({ league_id: league.id, user_id: userId }, { onConflict: 'league_id,user_id' });

  await fetchAndSetLeaderboard();
}

export async function incrementLigaScore(userId: string): Promise<void> {
  if (!userId) return;
  const { current } = useLigaStore.getState();
  if (!current) return;

  useLigaStore.getState().incrementScore();

  const { data } = await supabase
    .from('league_members')
    .select('puzzles_week')
    .eq('league_id', current.leagueId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return;
  const newScore = (data.puzzles_week as number) + 1;

  await supabase
    .from('league_members')
    .update({ puzzles_week: newScore })
    .eq('league_id', current.leagueId)
    .eq('user_id', userId);

  analytics.track('league_score_updated', {
    score:             newScore,
    rank:              useLigaStore.getState().current?.myRank ?? 0,
    puzzles_this_week: newScore,
  });
}

export async function fetchAndSetLeaderboard(): Promise<void> {
  useLigaStore.getState().setLoading(true);
  try {
    const { data, error } = await supabase.rpc('get_my_league_leaderboard');
    if (error || !data || (data as any[]).length === 0) return;

    const rows = data as any[];
    const members: LeagueMember[] = rows.map((row) => ({
      memberId:    row.member_id,
      userId:      row.user_id,
      elo:         row.elo ?? 0,
      puzzlesWeek: row.puzzles_week,
      rank:        row.rank,
      isMe:        row.is_me,
    }));

    const first = rows[0];
    const me    = members.find((m) => m.isMe);
    const info: LeagueInfo = {
      leagueId:  first.league_id,
      weekStart: first.week_start,
      weekEnd:   first.week_end,
      members,
      myRank:    me?.rank ?? 0,
      myScore:   me?.puzzlesWeek ?? 0,
    };
    useLigaStore.getState().setLeague(info);
  } finally {
    useLigaStore.getState().setLoading(false);
  }
}

// Call on app start or when liga screen opens
export async function checkPreviousWeekResult(userId: string): Promise<void> {
  if (!userId) return;
  const { previousResult, resultSeen } = useLigaStore.getState();
  if (!resultSeen) return; // already have unseen result to show

  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('league_members')
    .select('rank, promoted, demoted, league_id, leagues(week_end)')
    .eq('user_id', userId)
    .not('rank', 'is', null)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return;
  const league = (data as any).leagues;
  if (!league || league.week_end >= today) return;
  if (previousResult?.weekEnd === league.week_end) return; // already shown this week's result

  const { count } = await supabase
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', (data as any).league_id);

  const result: PreviousLigaResult = {
    rank:     data.rank as number,
    total:    count ?? 30,
    promoted: data.promoted as boolean,
    demoted:  data.demoted as boolean,
    weekEnd:  league.week_end,
  };
  useLigaStore.getState().setPreviousResult(result);
}
