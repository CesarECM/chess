import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { analytics } from './analytics';
import { useUserStore } from '@/stores/useUserStore';
import { useReinoStore } from '@/stores/useReinoStore';
import type { HallId, HallProgressEntry } from '@/constants/reino';

export async function captureAndShare(viewRef: RefObject<View | null>): Promise<void> {
  if (!viewRef.current) return;
  const uri = await captureRef(viewRef, { format: 'png', quality: 1 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir Recap' });

  const { puzzlesCompleted, puzzlesFailed, streakDays } = useUserStore.getState();
  const { hallProgress } = useReinoStore.getState();
  const total    = puzzlesCompleted + puzzlesFailed;
  const accuracy = total > 0 ? Math.round((puzzlesCompleted / total) * 100) : 0;

  const entries  = Object.entries(hallProgress) as [HallId, HallProgressEntry][];
  const bestHall = entries.length > 0
    ? entries.reduce((a, b) => (a[1].puzzlesCount > b[1].puzzlesCount ? a : b))[0]
    : null;

  analytics.track('recap_shared', {
    puzzles_count:    puzzlesCompleted,
    accuracy_pct:     accuracy,
    hall_dominated:   bestHall,
    streak_days:      streakDays,
  });
}
