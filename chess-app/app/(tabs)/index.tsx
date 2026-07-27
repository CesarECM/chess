import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import type { ListRenderItemInfo, ViewToken, FlashListRef } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore, LOCKED_SLOT } from '@/stores/usePuzzleStore';
import { buildReviewQueue } from '@/services/reviewQueue';
import { getOrCreateGuestId } from '@/services/identity';
import { cachePuzzles, getCachedPuzzles } from '@/services/puzzleCache';
import { PuzzleCard } from '@/components/feed/PuzzleCard';
import { MessageCard } from '@/components/feed/MessageCard';
import { LockedSlot } from '@/components/feed/LockedSlot';
import { PastPuzzleOverlay } from '@/components/feed/FeedItemOverlay';
import { showInterstitialIfDue } from '@/services/ads';
import { PROGRESS_CARDS_ENABLED } from '@/constants';
import { detectSessionStartEvents } from '@/services/feedMessages';
import type { FeedItem, Puzzle, ProgressMessage } from '@/types';
import type { SolverStatus } from '@/hooks/usePuzzleSolverLocal';

const PREFETCH_THRESHOLD           = 3;
const BATCH_SIZE                   = 10;
const OVERSCROLL_PROFILE_THRESHOLD = 50;

export default function FeedScreen() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const elo            = useUserStore((s) => s.elo);
  const feed           = usePuzzleStore((s) => s.feed);
  const setFeed        = usePuzzleStore((s) => s.setFeed);
  const sessionHistory = usePuzzleStore((s) => s.sessionHistory);

  const insertMessagesAfterIndex = usePuzzleStore((s) => s.insertMessagesAfterIndex);
  const insertBeforeLockedSlot   = usePuzzleStore((s) => s.insertBeforeLockedSlot);
  const initSession              = usePuzzleStore((s) => s.initSession);
  const solvedPuzzleIds          = usePuzzleStore((s) => s.solvedPuzzleIds);
  const failedPuzzleIds          = usePuzzleStore((s) => s.failedPuzzleIds);

  const [isLoading,    setIsLoading]    = useState(true);
  const [hasError,     setHasError]     = useState(false);
  const [activeIndex,  setActiveIndex]  = useState(0);
  const [listHeight,   setListHeight]   = useState(Dimensions.get('window').height - 80);
  const [activeStatus, setActiveStatus] = useState<SolverStatus>('idle');

  const listRef           = useRef<FlashListRef<FeedItem> | null>(null);
  const prefetching       = useRef(false);
  const userIdRef         = useRef<string | null>(null);
  const eloRef            = useRef(elo);
  const feedRef           = useRef(feed);
  const sessionHistoryRef = useRef(sessionHistory);
  const activeIndexRef    = useRef(activeIndex);
  const listHeightRef     = useRef(listHeight);

  // Puzzle buffer: pre-fetched puzzles not yet in the feed
  const puzzleBufferRef      = useRef<Puzzle[]>([]);
  const pendingNextPuzzleRef = useRef(false); // true when onComplete fired but buffer was empty

  const profileHintAnim   = useRef(new Animated.Value(0)).current;
  const profileHintActive = useRef(false);

  eloRef.current            = elo;
  feedRef.current           = feed;
  sessionHistoryRef.current = sessionHistory;
  activeIndexRef.current    = activeIndex;
  listHeightRef.current     = listHeight;

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

            let feedItems: FeedItem[] = [puzzles[0]];
            if (PROGRESS_CARDS_ENABLED) {
              const { streakDays, weekStartDate, weeklyPuzzleCount } = useUserStore.getState();
              initSession(eloRef.current);
              const sessionMessages = detectSessionStartEvents({
                streakDays,
                weekStartDate,
                weeklyPuzzleCount,
                elo: eloRef.current,
              });
              if (sessionMessages.length > 0) {
                feedItems = [puzzles[0], ...sessionMessages];
              }
            }

            // Buffer holds the remaining puzzles (not in feed yet)
            puzzleBufferRef.current = puzzles.slice(1);
            setFeed([...feedItems, LOCKED_SLOT]);
          } else {
            setHasError(true);
          }
        }
      } catch {
        if (!cancelled) {
          const cached = await getCachedPuzzles();
          if (cached.length) {
            puzzleBufferRef.current = cached.slice(1);
            setFeed([cached[0], LOCKED_SLOT]);
          } else {
            setHasError(true);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Prefetch: fills buffer when it runs low ───────────────────────────────
  useEffect(() => {
    if (puzzleBufferRef.current.length > PREFETCH_THRESHOLD || prefetching.current) return;

    prefetching.current = true;
    (async () => {
      try {
        const userId = userIdRef.current ?? await getOrCreateGuestId();
        const more   = await buildReviewQueue(userId, eloRef.current, BATCH_SIZE, sessionHistoryRef.current);
        if (more.length) {
          cachePuzzles(more);
          puzzleBufferRef.current = [...puzzleBufferRef.current, ...more];

          // If a puzzle was owed but buffer was empty, deliver it now
          if (pendingNextPuzzleRef.current) {
            pendingNextPuzzleRef.current = false;
            const next = puzzleBufferRef.current.shift();
            if (next) {
              usePuzzleStore.getState().insertBeforeLockedSlot([next]);
              setActiveStatus('idle');
            }
          }
        }
      } catch {
        // Offline during prefetch — silently skip
      } finally {
        prefetching.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ── Navigation side-effect: reset status ─────────────────────────────────
  useEffect(() => {
    setActiveStatus('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ── Stable callback for progress card insertion ───────────────────────────
  const handleMessagesEarned = useCallback(
    (messages: ProgressMessage[], feedIndex: number) => {
      insertMessagesAfterIndex(feedIndex, messages);
    },
    [insertMessagesAfterIndex],
  );

  // ── Profile hint on overscroll ────────────────────────────────────────────
  const showProfileHintThenFade = useCallback(() => {
    if (profileHintActive.current) return;
    profileHintActive.current = true;
    Animated.sequence([
      Animated.timing(profileHintAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(profileHintAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => { profileHintActive.current = false; });
  }, [profileHintAnim]);

  const handleScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS !== 'ios') return;
      if (profileHintActive.current) return;
      const maxScroll  = (activeIndexRef.current + 1) * listHeightRef.current;
      const overscroll = Math.max(0, nativeEvent.contentOffset.y - maxScroll);
      profileHintAnim.setValue(Math.min(overscroll / 80, 1));
    },
    [profileHintAnim],
  );

  const handleScrollEndDrag = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS === 'web') return;
      const maxScroll  = (activeIndexRef.current + 1) * listHeightRef.current;
      const overscroll = nativeEvent.contentOffset.y - maxScroll;
      if (overscroll > OVERSCROLL_PROFILE_THRESHOLD) {
        showProfileHintThenFade();
      } else {
        if (!profileHintActive.current) {
          Animated.timing(profileHintAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
        }
      }
    },
    [profileHintAnim, showProfileHintThenFade],
  );

  const onActiveStatusChange = useCallback((status: SolverStatus) => {
    setActiveStatus(status);
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 51 }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first?.index !== null && first?.index !== undefined) {
        setActiveIndex(first.index as number);
      }
    },
    [],
  );

  const onScrollEnd = useCallback(() => {
    if (Platform.OS !== 'web') return;
    listRef.current?.scrollToIndex({ index: activeIndexRef.current, animated: false });
  }, []);

  // Called when a puzzle is completed (solved or review finished)
  const handleComplete = useCallback(() => {
    showInterstitialIfDue();

    const next = puzzleBufferRef.current.shift();
    if (next) {
      // Insert next puzzle synchronously before scrolling
      usePuzzleStore.getState().insertBeforeLockedSlot([next]);
    } else {
      // Buffer empty — mark as pending; prefetch will deliver when ready
      pendingNextPuzzleRef.current = true;
    }

    setActiveIndex((prev) => {
      const feedLength = usePuzzleStore.getState().feed.length;
      const next       = prev + 1;
      if (next < feedLength) {
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      }
      return prev;
    });
  }, []);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<FeedItem>) => {
    const position = index < activeIndex ? 'past' : index === activeIndex ? 'active' : 'future';

    // ── LockedSlot ────────────────────────────────────────────────────────
    if ('kind' in item && item.kind === 'locked-slot') {
      return <LockedSlot height={listHeight} />;
    }

    // ── MessageCard (progress card) ───────────────────────────────────────
    if ('kind' in item) {
      return (
        <MessageCard
          message={item}
          height={listHeight}
          onComplete={handleComplete}
        />
      );
    }

    // ── PuzzleCard ────────────────────────────────────────────────────────
    const puzzle = item as Puzzle;
    const isCurrentlyActive = position === 'active';
    const isSolved          = solvedPuzzleIds.includes(puzzle.id);

    return (
      <View style={{ flex: 1 }}>
        <PuzzleCard
          puzzle={puzzle}
          height={listHeight}
          isActive={isCurrentlyActive}
          feedIndex={index}
          onComplete={handleComplete}
          onStatusChange={isCurrentlyActive ? onActiveStatusChange : undefined}
          onMessagesEarned={handleMessagesEarned}
        />

        {position === 'past' && (
          <PastPuzzleOverlay
            solved={isSolved}
            height={listHeight}
          />
        )}
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listHeight, activeIndex, solvedPuzzleIds, handleComplete, onActiveStatusChange, handleMessagesEarned]);

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
        extraData={{ activeIndex, solvedPuzzleIds, failedPuzzleIds }}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        scrollEnabled={Platform.OS === 'web' || activeStatus !== 'playing'}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={onScrollEnd}
        bounces={Platform.OS === 'ios'}
      />

      {Platform.OS !== 'web' && (
        <Animated.View
          style={[
            styles.profileHint,
            {
              opacity: profileHintAnim,
              transform: [{
                translateY: profileHintAnim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: [40, 0],
                }),
              }],
            },
          ]}
        >
          <Text
            style={[styles.profileHintIcon, { color: colors.accent }]}
            onPress={() => router.push('/(tabs)/profile')}
          >
            👤
          </Text>
          <Text style={[styles.profileHintText, { color: colors.textSecondary }]}>
            {t('feed.viewProfile')}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileHint:      { position: 'absolute', bottom: 40, alignSelf: 'center', alignItems: 'center', gap: 6 },
  profileHintIcon:  { fontSize: 36 },
  profileHintText:  { fontSize: 13, fontWeight: '600' },
});
