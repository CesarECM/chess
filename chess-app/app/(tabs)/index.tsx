import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DebugPanel } from '@/components/debug/DebugPanel';
import type { DebugEntry } from '@/components/debug/DebugPanel';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore, LOCKED_SLOT } from '@/stores/usePuzzleStore';
import { buildReviewQueue, buildCalibrationQueue } from '@/services/reviewQueue';
import { getOrCreateGuestId } from '@/services/identity';
import { cachePuzzles, getCachedPuzzles } from '@/services/puzzleCache';
import { PuzzleCard } from '@/components/feed/PuzzleCard';
import { MessageCard } from '@/components/feed/MessageCard';
import { LockedSlot } from '@/components/feed/LockedSlot';
import { SpringPager } from '@/components/feed/SpringPager';
import type { SpringPagerRef } from '@/components/feed/SpringPager';
import { showInterstitialIfDue } from '@/services/ads';
import { PROGRESS_CARDS_ENABLED } from '@/constants';
import { detectSessionStartEvents } from '@/services/feedMessages';
import type { FeedItem, Puzzle, ProgressMessage } from '@/types';
import type { SolverStatus } from '@/hooks/usePuzzleSolverLocal';

const PREFETCH_THRESHOLD = 3;
const BATCH_SIZE         = 10;

export default function FeedScreen() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const elo                 = useUserStore((s) => s.elo);
  const preEloLow           = useUserStore((s) => s.preEloLow);
  const preEloHigh          = useUserStore((s) => s.preEloHigh);
  const onboardingCompleted = useUserStore((s) => s.onboardingCompleted);
  const feed           = usePuzzleStore((s) => s.feed);
  const setFeed        = usePuzzleStore((s) => s.setFeed);
  const sessionHistory = usePuzzleStore((s) => s.sessionHistory);

  const insertMessagesAfterIndex = usePuzzleStore((s) => s.insertMessagesAfterIndex);
  const insertBeforeLockedSlot   = usePuzzleStore((s) => s.insertBeforeLockedSlot);
  const initSession              = usePuzzleStore((s) => s.initSession);
  const solvedPuzzleIds          = usePuzzleStore((s) => s.solvedPuzzleIds);
  const failedPuzzleIds          = usePuzzleStore((s) => s.failedPuzzleIds);
  const skippedPuzzleIds         = usePuzzleStore((s) => s.skippedPuzzleIds);

  const [isLoading,        setIsLoading]        = useState(true);
  const [hasError,         setHasError]         = useState(false);
  const [activeIndex,      setActiveIndex]      = useState(0);
  const [listHeight,       setListHeight]       = useState(Dimensions.get('window').height - 80);
  const [activeStatus,     setActiveStatus]     = useState<SolverStatus>('idle');
  const [waitingForBuffer, setWaitingForBuffer] = useState(false);

  // ── Debug panel ──────────────────────────────────────────────────────────
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const debugTaps      = useRef(0);
  const debugTapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((tag: DebugEntry['tag'], msg: string) => {
    setDebugEntries((prev) => [...prev, { ts: Date.now(), tag, msg }]);
  }, []);

  const handleDebugTap = useCallback(() => {
    debugTaps.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    debugTapTimer.current = setTimeout(() => { debugTaps.current = 0; }, 600);
    if (debugTaps.current >= 3) {
      debugTaps.current = 0;
      setDebugVisible((v) => !v);
    }
  }, []);

  const pagerRef               = useRef<SpringPagerRef | null>(null);
  const initializedRef         = useRef(false);
  const prefetching            = useRef(false);
  const userIdRef              = useRef<string | null>(null);
  const eloRef                 = useRef(elo);
  const feedRef                = useRef(feed);
  const sessionHistoryRef      = useRef(sessionHistory);
  const activeIndexRef         = useRef(activeIndex);
  const listHeightRef          = useRef(listHeight);
  const activePuzzleForceFailRef = useRef<(() => void) | null>(null);
  const atLockedSlotRef          = useRef(false);

  const puzzleBufferRef      = useRef<Puzzle[]>([]);
  const pendingNextPuzzleRef = useRef(false);

  const profileHintAnim   = useRef(new Animated.Value(0)).current;
  const profileHintActive = useRef(false);

  const preEloLowRef  = useRef(preEloLow);
  const preEloHighRef = useRef(preEloHigh);
  const recalibrationCheckedRef = useRef(false);

  eloRef.current            = elo;
  feedRef.current           = feed;
  sessionHistoryRef.current = sessionHistory;
  activeIndexRef.current    = activeIndex;
  listHeightRef.current     = listHeight;
  preEloLowRef.current      = preEloLow;
  preEloHighRef.current     = preEloHigh;

  // ── Initial feed load ────────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    if (!onboardingCompleted) return; // wait — bounds not set yet
    let cancelled = false;
    (async () => {
      try {
        const userId = await getOrCreateGuestId();
        userIdRef.current = userId;

        // ── Recalibration check (once per session) ───────────────────────
        let calibrationStarted = false;
        if (!recalibrationCheckedRef.current) {
          recalibrationCheckedRef.current = true;
          const { checkRecalibrationNeeded, startRecalibration, preEloLow: currentLow } = useUserStore.getState();
          if (currentLow === null && checkRecalibrationNeeded()) {
            startRecalibration();
            calibrationStarted = true;
          }
        }

        // ── Choose queue strategy ────────────────────────────────────────
        const { preEloLow: low, preEloHigh: high, firstPuzzleRating, clearFirstPuzzleRating } = useUserStore.getState();
        const isCalibrating = low !== null;

        let puzzles: import('@/types').Puzzle[];
        if (isCalibrating) {
          const target = firstPuzzleRating ?? Math.round((low! + high!) / 2);
          if (firstPuzzleRating) clearFirstPuzzleRating();
          puzzles = await buildCalibrationQueue(target, BATCH_SIZE, sessionHistoryRef.current);
        } else {
          puzzles = await buildReviewQueue(userId, eloRef.current, BATCH_SIZE, sessionHistoryRef.current);
        }
        if (!cancelled) {
          if (puzzles.length) {
            cachePuzzles(puzzles);

            let feedItems: FeedItem[] = [puzzles[0]];
            if (PROGRESS_CARDS_ENABLED) {
              const { streakDays, weekStartDate, weeklyPuzzleCount } = useUserStore.getState();
              initSession(eloRef.current);

              if (calibrationStarted) {
                const calibMsg: ProgressMessage = {
                  id:      `calibration_start_${Date.now()}`,
                  kind:    'progress',
                  type:    'calibration_start',
                  payload: { bodyIndex: Math.floor(Math.random() * 5) },
                };
                feedItems = [calibMsg, puzzles[0]];
                addLog('INIT', 'Recalibration triggered — inserted calibration_start card');
              } else {
                const sessionMessages = detectSessionStartEvents({
                  streakDays,
                  weekStartDate,
                  weeklyPuzzleCount,
                  elo: eloRef.current,
                });
                if (sessionMessages.length > 0) {
                  feedItems = [puzzles[0], ...sessionMessages];
                  addLog('INIT', `Session msgs: ${sessionMessages.length} (${sessionMessages.map((m) => m.type).join(', ')})`);
                }
              }
            }

            puzzleBufferRef.current = puzzles.slice(1);
            initializedRef.current  = true;
            addLog('INIT', `Loaded ${puzzles.length} puzzles — buffer: ${puzzleBufferRef.current.length}, ELO: ${eloRef.current}, history: ${sessionHistoryRef.current.length}`);
            setFeed([...feedItems, LOCKED_SLOT]);
          } else {
            addLog('ERROR', `Initial load returned 0 puzzles — ELO: ${eloRef.current}`);
            setHasError(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          addLog('ERROR', `Initial load failed: ${String(err)}`);
          const cached = await getCachedPuzzles();
          if (cached.length) {
            addLog('INIT', `Fallback cache: ${cached.length} puzzles`);
            puzzleBufferRef.current = cached.slice(1);
            initializedRef.current  = true;
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
  }, [onboardingCompleted]);

  // ── Prefetch: fills buffer when it runs low ───────────────────────────────
  useEffect(() => {
    if (!initializedRef.current) return;
    if (puzzleBufferRef.current.length > PREFETCH_THRESHOLD || prefetching.current) return;

    const bufferIds     = puzzleBufferRef.current.map((p) => p.id);
    const feedPuzzleIds = feedRef.current
      .filter((item): item is Puzzle => !('kind' in item))
      .map((p) => p.id);
    const excludeIds = [...new Set([...sessionHistoryRef.current, ...bufferIds, ...feedPuzzleIds])];

    const bufferBefore = puzzleBufferRef.current.length;
    const historyLen   = sessionHistoryRef.current.length;
    addLog('PREFETCH', `Start — buf: ${bufferBefore}, history: ${historyLen}, excl: ${excludeIds.length}, ELO: ${eloRef.current}, pending: ${pendingNextPuzzleRef.current}`);
    prefetching.current = true;
    (async () => {
      try {
        const userId = userIdRef.current ?? await getOrCreateGuestId();
        const { preEloLow: pLow, preEloHigh: pHigh } = useUserStore.getState();
        const isPrefetchCalibrating = pLow !== null;
        const more = isPrefetchCalibrating
          ? await buildCalibrationQueue(Math.round((pLow! + pHigh!) / 2), BATCH_SIZE, excludeIds)
          : await buildReviewQueue(userId, eloRef.current, BATCH_SIZE, excludeIds);
        addLog('PREFETCH', `Got ${more.length} puzzles — buf before: ${puzzleBufferRef.current.length}`);
        if (more.length) {
          cachePuzzles(more);
          puzzleBufferRef.current = [...puzzleBufferRef.current, ...more];
          addLog('PREFETCH', `Buffer now: ${puzzleBufferRef.current.length}`);

          if (pendingNextPuzzleRef.current) {
            pendingNextPuzzleRef.current = false;
            const next = puzzleBufferRef.current.shift();
            if (next) {
              const lockedSlotIdx = usePuzzleStore.getState().feed.length - 1;
              addLog('BUFFER', `Delivering pending puzzle ${next.id} — buf now: ${puzzleBufferRef.current.length}, atLocked: ${atLockedSlotRef.current}`);
              usePuzzleStore.getState().insertBeforeLockedSlot([next]);
              if (atLockedSlotRef.current) {
                atLockedSlotRef.current = false;
                activeIndexRef.current  = lockedSlotIdx;
                setActiveIndex(lockedSlotIdx);
                pagerRef.current?.scrollToIndex(lockedSlotIdx, false);
              }
              setActiveStatus('idle');
              setWaitingForBuffer(false);
            }
          }
        } else {
          addLog('ERROR', `Prefetch returned 0 — pool exhausted? history: ${historyLen}, ELO: ${eloRef.current}, pending: ${pendingNextPuzzleRef.current}`);
        }
      } catch (err) {
        addLog('ERROR', `Prefetch failed: ${String(err)}`);
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
      addLog('MESSAGES', `${messages.length} card(s) at idx ${feedIndex}: ${messages.map((m) => m.type).join(', ')}`);
      insertMessagesAfterIndex(feedIndex, messages);
    },
    [insertMessagesAfterIndex, addLog],
  );

  // ── Profile hint on overscroll (iOS only) ────────────────────────────────
  const showProfileHintThenFade = useCallback(() => {
    if (profileHintActive.current) return;
    profileHintActive.current = true;
    Animated.sequence([
      Animated.timing(profileHintAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(profileHintAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => { profileHintActive.current = false; });
  }, [profileHintAnim]);

  const onActiveStatusChange = useCallback((status: SolverStatus) => {
    setActiveStatus(status);
    if (status === 'complete' || status === 'reviewed') {
      const bufLen = puzzleBufferRef.current.length;
      const next   = puzzleBufferRef.current.shift();
      if (next) {
        addLog('SOLVE', `${status} — inserting ${next.id} — buf: ${bufLen} → ${puzzleBufferRef.current.length}`);
        usePuzzleStore.getState().insertBeforeLockedSlot([next]);
        setWaitingForBuffer(false);
      } else {
        addLog('SOLVE', `${status} — buffer EMPTY (${bufLen}) → pendingNextPuzzle=true, history: ${sessionHistoryRef.current.length}`);
        pendingNextPuzzleRef.current = true;
        setWaitingForBuffer(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]);

  // ── Index change from SpringPager ─────────────────────────────────────────
  const handleIndexChange = useCallback((newIndex: number) => {
    const item = feedRef.current[newIndex];

    if (item && 'kind' in item && item.kind === 'locked-slot') {
      atLockedSlotRef.current = true;
      return;
    }
    atLockedSlotRef.current = false;

    // Scrolling backward into a past MessageCard — skip to nearest puzzle
    if (newIndex < activeIndexRef.current && item && 'kind' in item && item.kind === 'progress') {
      let targetIndex = newIndex - 1;
      while (targetIndex >= 0) {
        const prev = feedRef.current[targetIndex];
        if (!prev || !('kind' in prev) || prev.kind !== 'progress') break;
        targetIndex--;
      }
      if (targetIndex >= 0) {
        activeIndexRef.current = targetIndex;
        setActiveIndex(targetIndex);
        pagerRef.current?.scrollToIndex(targetIndex);
        return;
      }
    }

    setActiveIndex(newIndex);
  }, []);

  const goToActivePuzzle = useCallback(() => {
    const targetIndex = feedRef.current.length - 2;
    if (targetIndex >= 0) {
      pagerRef.current?.scrollToIndex(targetIndex);
    }
  }, []);

  const handleSkipFromLockedSlot = useCallback(() => {
    const bufLen = puzzleBufferRef.current.length;
    addLog('SKIP', `LockedSlot skip — buf: ${bufLen}, history: ${sessionHistoryRef.current.length}`);
    activePuzzleForceFailRef.current?.();

    const lockedSlotIdx = feedRef.current.length - 1;
    const next = puzzleBufferRef.current.shift();
    if (next) {
      addLog('SKIP', `Inserting ${next.id} — buf now: ${puzzleBufferRef.current.length}`);
      usePuzzleStore.getState().insertBeforeLockedSlot([next]);
      setWaitingForBuffer(false);
    } else {
      addLog('SKIP', `Buffer empty → pendingNextPuzzle=true`);
      pendingNextPuzzleRef.current = true;
      setWaitingForBuffer(true);
    }
    activeIndexRef.current = lockedSlotIdx;
    setActiveIndex(lockedSlotIdx);
    pagerRef.current?.scrollToIndex(lockedSlotIdx, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]);

  // Scroll-only advance — used by MessageCards (no buffer consumption)
  const scrollToNext = useCallback(() => {
    showInterstitialIfDue();
    const feedLength = usePuzzleStore.getState().feed.length;
    const nextIdx    = activeIndexRef.current + 1;
    if (nextIdx < feedLength) {
      activeIndexRef.current = nextIdx;
      setActiveIndex(nextIdx);
      pagerRef.current?.scrollToIndex(nextIdx);
    }
  }, []);

  const handleComplete = useCallback(() => {
    // If the next feed item is the LockedSlot the buffer was never consumed
    // (happens when the user clicks "Siguiente puzzle" while still in reviewing state).
    const nextItem = feedRef.current[activeIndexRef.current + 1];
    const nextIsLocked = nextItem && 'kind' in nextItem && nextItem.kind === 'locked-slot';
    if (nextIsLocked) {
      const bufLen = puzzleBufferRef.current.length;
      const next   = puzzleBufferRef.current.shift();
      if (next) {
        addLog('SOLVE', `early-exit review — inserting ${next.id} — buf: ${bufLen} → ${puzzleBufferRef.current.length}`);
        usePuzzleStore.getState().insertBeforeLockedSlot([next]);
        setWaitingForBuffer(false);
      } else {
        addLog('SOLVE', `early-exit review — buffer EMPTY (${bufLen}) → pendingNextPuzzle=true`);
        pendingNextPuzzleRef.current = true;
        setWaitingForBuffer(true);
      }
    }
    scrollToNext();
  }, [scrollToNext, addLog]);

  // ── pager enabled: web always scrollable; native blocked while mid-puzzle ─
  const pagerEnabled = Platform.OS === 'web' || activeStatus === 'idle' || activeStatus === 'complete' || activeStatus === 'reviewed';

  const renderFeedItem = useCallback((item: FeedItem, index: number) => {
    const position = index < activeIndex ? 'past' : index === activeIndex ? 'active' : 'future';

    // ── LockedSlot ──────────────────────────────────────────────────────
    if ('kind' in item && item.kind === 'locked-slot') {
      return (
        <LockedSlot
          height={listHeight}
          isLoading={waitingForBuffer}
          onNext={handleSkipFromLockedSlot}
          onGoToPuzzle={goToActivePuzzle}
        />
      );
    }

    // ── MessageCard — invisible when past ───────────────────────────────
    if ('kind' in item) {
      if (position === 'past') return <View style={{ flex: 1 }} />;
      return (
        <MessageCard
          message={item}
          height={listHeight}
          onComplete={scrollToNext}
        />
      );
    }

    // ── PuzzleCard ──────────────────────────────────────────────────────
    const puzzle    = item as Puzzle;
    const isSolved  = solvedPuzzleIds.includes(puzzle.id);
    const isFailed  = failedPuzzleIds.includes(puzzle.id);
    const isSkipped = skippedPuzzleIds.includes(puzzle.id);
    const isDone    = isSolved || isFailed || isSkipped;
    const isCurrentlyActive = position === 'active' && !isDone;

    const pastBg = isDone || position === 'past'
      ? isSolved
        ? colors.success + '28'
        : colors.error   + '28'
      : undefined;

    return (
      <PuzzleCard
        puzzle={puzzle}
        height={listHeight}
        isActive={isCurrentlyActive}
        feedIndex={index}
        onComplete={handleComplete}
        onStatusChange={isCurrentlyActive ? onActiveStatusChange : undefined}
        onMessagesEarned={handleMessagesEarned}
        backgroundColor={pastBg}
        onForceFailRef={isCurrentlyActive ? activePuzzleForceFailRef : undefined}
        onDebugLog={addLog}
      />
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listHeight, activeIndex, solvedPuzzleIds, waitingForBuffer, scrollToNext, handleComplete, onActiveStatusChange, handleMessagesEarned, goToActivePuzzle, handleSkipFromLockedSlot]);

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
      style={[styles.container, { backgroundColor: colors.background }]}
      onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
    >
      <SpringPager
        ref={pagerRef}
        itemHeight={listHeight}
        itemCount={feed.length}
        enabled={pagerEnabled}
        onIndexChange={handleIndexChange}
        onOverscrollDown={Platform.OS === 'ios' ? showProfileHintThenFade : undefined}
      >
        {feed.map((item, index) => (
          <View key={item.id} style={{ height: listHeight }}>
            {renderFeedItem(item, index)}
          </View>
        ))}
      </SpringPager>

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

      {/* Debug toggle — triple-tap top-right corner */}
      <TouchableOpacity
        onPress={handleDebugTap}
        style={styles.debugTap}
        activeOpacity={1}
      />

      {debugVisible && (
        <DebugPanel
          entries={debugEntries}
          onClose={() => setDebugVisible(false)}
          onClear={() => setDebugEntries([])}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileHint:     { position: 'absolute', bottom: 40, alignSelf: 'center', alignItems: 'center', gap: 6 },
  profileHintIcon: { fontSize: 36 },
  profileHintText: { fontSize: 13, fontWeight: '600' },
  debugTap:        { position: 'absolute', top: 0, right: 0, width: 60, height: 60 },
});
