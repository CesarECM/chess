import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { ListRenderItemInfo, ViewToken, FlashListRef } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { buildReviewQueue } from '@/services/reviewQueue';
import { getOrCreateGuestId } from '@/services/identity';
import { cachePuzzles, getCachedPuzzles } from '@/services/puzzleCache';
import { PuzzleCard } from '@/components/feed/PuzzleCard';
import { MessageCard } from '@/components/feed/MessageCard';
import { SkipWarningModal } from '@/components/feed/SkipWarningModal';
import { showInterstitialIfDue } from '@/services/ads';
import { PROGRESS_CARDS_ENABLED } from '@/constants';
import { detectSessionStartEvents } from '@/services/feedMessages';
import type { FeedItem, Puzzle } from '@/types';
import type { SolverStatus } from '@/hooks/usePuzzleSolverLocal';

const PREFETCH_THRESHOLD = 3;
const BATCH_SIZE         = 10;

// States that mean the current puzzle was left incomplete
const INCOMPLETE: SolverStatus[] = ['idle', 'playing', 'failed'];

export default function FeedScreen() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const elo            = useUserStore((s) => s.elo);
  const feed           = usePuzzleStore((s) => s.feed);
  const setFeed        = usePuzzleStore((s) => s.setFeed);
  const appendToFeed   = usePuzzleStore((s) => s.appendToFeed);
  const sessionHistory = usePuzzleStore((s) => s.sessionHistory);

  const pendingMessages          = usePuzzleStore((s) => s.pendingMessages);
  const clearPendingMessages     = usePuzzleStore((s) => s.clearPendingMessages);
  const insertMessagesAfterIndex = usePuzzleStore((s) => s.insertMessagesAfterIndex);
  const initSession              = usePuzzleStore((s) => s.initSession);
  const setPendingFail           = usePuzzleStore((s) => s.setPendingFail);

  const [isLoading,       setIsLoading]       = useState(true);
  const [hasError,        setHasError]        = useState(false);
  const [activeIndex,     setActiveIndex]     = useState(0);
  const [listHeight,      setListHeight]      = useState(Dimensions.get('window').height - 80);
  const [activeStatus,    setActiveStatus]    = useState<SolverStatus>('idle');
  // { puzzleId } of the incomplete puzzle the user left — drives skip-warning overlay
  const [skipWarningInfo, setSkipWarningInfo] = useState<{ puzzleId: string } | null>(null);

  const listRef              = useRef<FlashListRef<FeedItem> | null>(null);
  const prefetching          = useRef(false);
  const userIdRef            = useRef<string | null>(null);
  const eloRef               = useRef(elo);
  const feedLengthRef        = useRef(feed.length);
  const feedRef              = useRef(feed);          // always current feed for effects
  const sessionHistoryRef    = useRef(sessionHistory);
  const activeIndexRef       = useRef(activeIndex);
  const prevActiveIndexRef   = useRef<number>(-1);   // index before last navigation
  const goingBackToIndexRef  = useRef<number | null>(null); // set when user presses "Volver"

  eloRef.current            = elo;
  feedLengthRef.current     = feed.length;
  feedRef.current           = feed;
  sessionHistoryRef.current = sessionHistory;
  activeIndexRef.current    = activeIndex;

  // ── Initial feed load ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId  = await getOrCreateGuestId();
        userIdRef.current = userId;
        const puzzles = await buildReviewQueue(userId, eloRef.current, BATCH_SIZE, sessionHistoryRef.current);
        if (!cancelled) {
          if (puzzles.length) {
            cachePuzzles(puzzles);

            let feedItems: FeedItem[] = puzzles;
            if (PROGRESS_CARDS_ENABLED) {
              const { streakDays, weekStartDate, weeklyPuzzleCount } = useUserStore.getState();
              initSession(eloRef.current);
              const sessionMessages = detectSessionStartEvents({
                streakDays,
                weekStartDate,
                weeklyPuzzleCount,
                elo: eloRef.current,
              });
              if (sessionMessages.length > 0 && puzzles.length > 1) {
                feedItems = [puzzles[0], ...sessionMessages, ...puzzles.slice(1)];
              }
            }

            setFeed(feedItems);
          } else {
            setHasError(true);
          }
        }
      } catch {
        if (!cancelled) {
          const cached = await getCachedPuzzles();
          cached.length ? setFeed(cached) : setHasError(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Prefetch when few puzzle cards remain ahead ──────────────────────────
  useEffect(() => {
    if (feed.length === 0 || prefetching.current) return;
    const puzzlesAhead = feed.slice(activeIndex + 1).filter((item) => !('kind' in item)).length;
    if (puzzlesAhead > PREFETCH_THRESHOLD) return;

    prefetching.current = true;
    (async () => {
      try {
        const userId = userIdRef.current ?? await getOrCreateGuestId();
        const more   = await buildReviewQueue(userId, eloRef.current, BATCH_SIZE, sessionHistoryRef.current);
        if (more.length) {
          cachePuzzles(more);
          appendToFeed(more);
        }
      } catch {
        // Offline during prefetch — silently skip
      } finally {
        prefetching.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, feed.length]);

  // ── Navigation side-effects: reset status + skip-warning detection ───────
  useEffect(() => {
    // If this navigation was triggered by pressing "Volver" (go back), skip the warning
    if (goingBackToIndexRef.current !== null && goingBackToIndexRef.current === activeIndex) {
      goingBackToIndexRef.current = null;
      setActiveStatus('idle');
      return;
    }
    goingBackToIndexRef.current = null;

    const prevStatus  = activeStatus;   // value from the PREVIOUS render (before reset)
    const prevIdx     = prevActiveIndexRef.current;
    setActiveStatus('idle');

    // Show skip-warning when navigating away from an incomplete puzzle
    // (not on first mount where prevIdx = -1)
    if (prevIdx >= 0 && INCOMPLETE.includes(prevStatus)) {
      const prevItem = feedRef.current[prevIdx];
      if (prevItem && !('kind' in prevItem)) {
        setSkipWarningInfo({ puzzleId: (prevItem as Puzzle).id });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ── Insert pending progress messages after the current card ─────────────
  useEffect(() => {
    if (pendingMessages.length === 0) return;
    insertMessagesAfterIndex(activeIndexRef.current, pendingMessages);
    clearPendingMessages();
  }, [pendingMessages, insertMessagesAfterIndex, clearPendingMessages]);

  const onActiveStatusChange = useCallback((status: SolverStatus) => {
    setActiveStatus(status);
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 51 }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first?.index !== null && first?.index !== undefined) {
        setActiveIndex((prev) => {
          prevActiveIndexRef.current = prev;   // capture before update
          return first.index as number;
        });
      }
    },
    [],
  );

  // Force-snap to activeIndex on web after scroll ends (prevents stuck-between state)
  const onScrollEnd = useCallback(() => {
    if (Platform.OS !== 'web') return;
    listRef.current?.scrollToIndex({ index: activeIndexRef.current, animated: false });
  }, []);

  const scrollToNext = useCallback(() => {
    showInterstitialIfDue();
    setActiveIndex((prev) => {
      prevActiveIndexRef.current = prev;
      const next = prev + 1;
      if (next < feedLengthRef.current) {
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      }
      return prev;
    });
  }, []);

  // Called when the user confirms the skip-warning ("Ver siguiente")
  const handleSkipConfirm = useCallback(() => {
    if (skipWarningInfo) {
      setPendingFail(skipWarningInfo.puzzleId);
    }
    setSkipWarningInfo(null);
  }, [skipWarningInfo, setPendingFail]);

  // Called when the user presses "Volver al puzzle" in the skip-warning modal
  const handleSkipGoBack = useCallback(() => {
    const targetIdx = prevActiveIndexRef.current;
    goingBackToIndexRef.current = targetIdx;
    setSkipWarningInfo(null);
    setActiveIndex((prev) => {
      prevActiveIndexRef.current = prev;
      listRef.current?.scrollToIndex({ index: targetIdx, animated: true });
      return targetIdx;
    });
  }, []);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<FeedItem>) => {
    if ('kind' in item) {
      return (
        <MessageCard
          message={item}
          height={listHeight}
          onComplete={scrollToNext}
        />
      );
    }

    const isCurrentlyActive = index === activeIndex;
    // Block the board from starting while the skip-warning is shown
    const isActiveAndUnblocked = isCurrentlyActive && skipWarningInfo === null;

    return (
      <View style={{ flex: 1 }}>
        <PuzzleCard
          puzzle={item as Puzzle}
          height={listHeight}
          isActive={isActiveAndUnblocked}
          onComplete={scrollToNext}
          onStatusChange={isActiveAndUnblocked ? onActiveStatusChange : undefined}
        />
        {isCurrentlyActive && skipWarningInfo !== null && (
          <SkipWarningModal
            height={listHeight}
            onConfirm={handleSkipConfirm}
            onGoBack={handleSkipGoBack}
          />
        )}
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listHeight, activeIndex, skipWarningInfo, scrollToNext, onActiveStatusChange, handleSkipConfirm, handleSkipGoBack]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (hasError || feed.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.error, fontSize: typography.size.md, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 }}>
          {t('feed.loadError')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        Platform.OS === 'web' && { height: listHeight },
      ]}
      onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
    >
      <FlashList
        ref={listRef}
        data={feed}
        extraData={{ activeIndex, skipWarningInfo }}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        // On web, always allow scroll — blocking during 'playing' causes the list
        // to get stuck between two pages when revisiting a card that re-enters 'playing'
        scrollEnabled={Platform.OS === 'web' || activeStatus !== 'playing'}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onMomentumScrollEnd={onScrollEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
