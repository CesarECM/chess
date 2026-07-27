import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
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
import { FuturePlaceholder, PastPuzzleOverlay } from '@/components/feed/FeedItemOverlay';
import { showInterstitialIfDue } from '@/services/ads';
import { PROGRESS_CARDS_ENABLED } from '@/constants';
import { detectSessionStartEvents } from '@/services/feedMessages';
import type { FeedItem, Puzzle, ProgressMessage } from '@/types';
import type { SolverStatus } from '@/hooks/usePuzzleSolverLocal';

const PREFETCH_THRESHOLD           = 3;
const BATCH_SIZE                   = 10;
const OVERSCROLL_PROFILE_THRESHOLD = 50; // px past the next-page boundary to show profile hint

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

  const insertMessagesAfterIndex = usePuzzleStore((s) => s.insertMessagesAfterIndex);
  const initSession              = usePuzzleStore((s) => s.initSession);
  const setPendingFail           = usePuzzleStore((s) => s.setPendingFail);
  const solvedPuzzleIds          = usePuzzleStore((s) => s.solvedPuzzleIds);
  const failedPuzzleIds          = usePuzzleStore((s) => s.failedPuzzleIds);

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

  // ── Additional refs ────────────────────────────────────────────────────
  const listHeightRef     = useRef(listHeight);
  const profileHintAnim   = useRef(new Animated.Value(0)).current;
  const profileHintActive = useRef(false); // prevents competing animations

  eloRef.current            = elo;
  feedLengthRef.current     = feed.length;
  feedRef.current           = feed;
  sessionHistoryRef.current = sessionHistory;
  activeIndexRef.current    = activeIndex;
  listHeightRef.current     = listHeight;

  // Feed slice: only one future item is rendered — creates a physical stop
  const visibleFeed = useMemo(
    () => feed.slice(0, activeIndex + 2),
    [feed, activeIndex],
  );

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

    const prevStatus    = activeStatus;   // value from the PREVIOUS render (before reset)
    const prevIdx       = prevActiveIndexRef.current;
    const isGoingForward = activeIndex > prevIdx;
    setActiveStatus('idle');

    // Show skip-warning only when navigating FORWARD away from an incomplete puzzle
    // (not on first mount where prevIdx = -1, not when scrolling back)
    if (prevIdx >= 0 && isGoingForward && INCOMPLETE.includes(prevStatus)) {
      const prevItem = feedRef.current[prevIdx];
      if (prevItem && !('kind' in prevItem)) {
        setSkipWarningInfo({ puzzleId: (prevItem as Puzzle).id });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ── Stable callback for progress card insertion at the correct feed index ─
  const handleMessagesEarned = useCallback(
    (messages: ProgressMessage[], feedIndex: number) => {
      insertMessagesAfterIndex(feedIndex, messages);
    },
    [insertMessagesAfterIndex],
  );

  // ── Profile hint: shows when user overscrolls past the one allowed future ─
  const showProfileHintThenFade = useCallback(() => {
    if (profileHintActive.current) return;
    profileHintActive.current = true;
    Animated.sequence([
      Animated.timing(profileHintAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(profileHintAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => { profileHintActive.current = false; });
  }, [profileHintAnim]);

  // Fires continuously during scroll — updates profile hint opacity on iOS overscroll
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

  // Fires when user releases the drag — trigger full hint-then-fade if enough pull
  const handleScrollEndDrag = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS === 'web') return;
      const maxScroll  = (activeIndexRef.current + 1) * listHeightRef.current;
      const overscroll = nativeEvent.contentOffset.y - maxScroll;
      if (overscroll > OVERSCROLL_PROFILE_THRESHOLD) {
        showProfileHintThenFade();
      } else {
        // Fade out any partial hint from the iOS live drag
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
    const position = index < activeIndex ? 'past' : index === activeIndex ? 'active' : 'future';

    // ── Future items: show placeholder, never render actual content ──────
    if (position === 'future') {
      return <FuturePlaceholder height={listHeight} />;
    }

    // ── MessageCard (progress card) ───────────────────────────────────────
    if ('kind' in item) {
      return (
        <MessageCard
          message={item}
          height={listHeight}
          onComplete={scrollToNext}
        />
      );
    }

    // ── PuzzleCard ────────────────────────────────────────────────────────
    const puzzle = item as Puzzle;
    const isCurrentlyActive     = position === 'active';
    const isActiveAndUnblocked  = isCurrentlyActive && skipWarningInfo === null;
    const isSolved              = solvedPuzzleIds.includes(puzzle.id);

    return (
      <View style={{ flex: 1 }}>
        <PuzzleCard
          puzzle={puzzle}
          height={listHeight}
          isActive={isActiveAndUnblocked}
          feedIndex={index}
          onComplete={scrollToNext}
          onStatusChange={isActiveAndUnblocked ? onActiveStatusChange : undefined}
          onMessagesEarned={handleMessagesEarned}
        />

        {/* Past puzzle: show solved/failed overlay */}
        {position === 'past' && (
          <PastPuzzleOverlay
            solved={isSolved}
            height={listHeight}
          />
        )}

        {/* Active puzzle with unresolved skip: show warning modal */}
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
  }, [listHeight, activeIndex, skipWarningInfo, solvedPuzzleIds, scrollToNext, onActiveStatusChange, handleSkipConfirm, handleSkipGoBack, handleMessagesEarned]);

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
        data={visibleFeed}
        extraData={{ activeIndex, skipWarningInfo, solvedPuzzleIds, failedPuzzleIds }}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        // On web, always allow scroll — blocking during 'playing' causes the list
        // to get stuck between two pages when revisiting a card that re-enters 'playing'
        scrollEnabled={Platform.OS === 'web' || (activeStatus !== 'playing' && skipWarningInfo === null)}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={onScrollEnd}
        bounces={Platform.OS === 'ios'}
      />

      {/* Profile hint: slides up from bottom when user overscrolls past the one allowed future */}
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
