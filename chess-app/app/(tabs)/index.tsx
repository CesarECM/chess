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
import { showInterstitialIfDue } from '@/services/ads';
import { PROGRESS_CARDS_ENABLED } from '@/constants';
import { detectSessionStartEvents } from '@/services/feedMessages';
import type { FeedItem, Puzzle } from '@/types';
import type { SolverStatus } from '@/hooks/usePuzzleSolverLocal';

const PREFETCH_THRESHOLD = 3;
const BATCH_SIZE         = 10;

export default function FeedScreen() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const elo            = useUserStore((s) => s.elo);
  const feed           = usePuzzleStore((s) => s.feed);
  const setFeed        = usePuzzleStore((s) => s.setFeed);
  const appendToFeed   = usePuzzleStore((s) => s.appendToFeed);
  const sessionHistory = usePuzzleStore((s) => s.sessionHistory);

  const pendingMessages         = usePuzzleStore((s) => s.pendingMessages);
  const clearPendingMessages    = usePuzzleStore((s) => s.clearPendingMessages);
  const insertMessagesAfterIndex = usePuzzleStore((s) => s.insertMessagesAfterIndex);
  const initSession             = usePuzzleStore((s) => s.initSession);

  const [isLoading,    setIsLoading]    = useState(true);
  const [hasError,     setHasError]     = useState(false);
  const [activeIndex,  setActiveIndex]  = useState(0);
  const [listHeight,   setListHeight]   = useState(Dimensions.get('window').height - 80);
  const [activeStatus, setActiveStatus] = useState<SolverStatus>('idle');

  const listRef            = useRef<FlashListRef<FeedItem> | null>(null);
  const prefetching        = useRef(false);
  const userIdRef          = useRef<string | null>(null);
  const eloRef             = useRef(elo);
  const feedLengthRef      = useRef(feed.length);
  const sessionHistoryRef  = useRef(sessionHistory);
  const activeIndexRef     = useRef(activeIndex);

  eloRef.current             = elo;
  feedLengthRef.current      = feed.length;
  sessionHistoryRef.current  = sessionHistory;
  activeIndexRef.current     = activeIndex;

  // Load the first batch on mount
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

            // Detect session-start events and prepend after first puzzle
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
        // Network unavailable — serve from local cache
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

  // Prefetch when ≤ PREFETCH_THRESHOLD puzzle cards remain ahead
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

  // Reset activeStatus when the active card changes
  useEffect(() => {
    setActiveStatus('idle');
  }, [activeIndex]);

  // Insert pending progress messages after the current card
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
        setActiveIndex(first.index);
      }
    },
    [],
  );

  const scrollToNext = useCallback(() => {
    showInterstitialIfDue();
    setActiveIndex((prev) => {
      const next = prev + 1;
      if (next < feedLengthRef.current) {
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      }
      return prev;
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
    return (
      <PuzzleCard
        puzzle={item as Puzzle}
        height={listHeight}
        isActive={index === activeIndex}
        onComplete={scrollToNext}
        onStatusChange={index === activeIndex ? onActiveStatusChange : undefined}
      />
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listHeight, activeIndex, scrollToNext, onActiveStatusChange]);

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
        extraData={activeIndex}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        scrollEnabled={activeStatus !== 'playing'}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
