import { useRef, type RefObject } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useShareCard } from '@/hooks/useShareCard';
import { analytics } from '@/services/analytics';
import type { DailyCompleteResult } from '@/hooks/usePuzzleSolverLocal';

interface Props {
  visible:  boolean;
  result:   DailyCompleteResult;
  puzzleId: string;
  onClose:  () => void;
}

function AttemptsDisplay({ attempts, solved }: { attempts: number; solved: boolean }) {
  const { colors } = useTheme();
  const squares = Array.from({ length: Math.min(attempts, 6) }, (_, i) => {
    const isLast = i === attempts - 1;
    const color  = isLast && solved ? colors.success : colors.error;
    return <View key={i} style={[styles.square, { backgroundColor: color }]} />;
  });
  return <View style={styles.squaresRow}>{squares}</View>;
}

function ShareableCard({
  result,
  date,
  cardRef,
}: {
  result:  DailyCompleteResult;
  date:    string;
  cardRef: RefObject<View>;
}) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      ref={cardRef}
      style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      collapsable={false}
    >
      <Text style={[styles.shareBrand, { color: colors.accent, fontSize: typography.size.md }]}>
        ♟ Chess Puzzles
      </Text>
      <Text style={[styles.shareTitle, { color: colors.text, fontSize: typography.size.lg }]}>
        {t('daily.shareTitle')} · {date}
      </Text>
      <AttemptsDisplay attempts={result.attempts} solved={result.solved} />
      <Text style={[styles.shareTheme, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
        {t(`tactic.${result.theme}`, result.theme)}
      </Text>
      <Text style={[styles.shareOutcome, { color: result.solved ? colors.success : colors.error, fontSize: typography.size.sm }]}>
        {result.solved ? t('daily.shareSolved') : t('daily.shareFailed')}
      </Text>
    </View>
  );
}

export function DailyPuzzleReveal({ visible, result, puzzleId, onClose }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const { cardRef, isSharing, captureAndShare } = useShareCard();
  const sharedRef = useRef(false);

  const today = new Date().toISOString().split('T')[0];

  const handleShare = async () => {
    if (!sharedRef.current) {
      sharedRef.current = true;
      analytics.track('daily_puzzle_shared', {
        puzzle_id: puzzleId,
        date:      today,
        solved:    result.solved,
        attempts:  result.attempts,
      });
    }
    await captureAndShare();
  };

  const rewardLabel = result.solved
    ? t('daily.rewardSolved')
    : t('daily.rewardFailed');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            {/* Header */}
            <Text style={[styles.header, { color: colors.accent, fontSize: typography.size['2xl'] }]}>
              📅
            </Text>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.size.xl }]}>
              {t('daily.revealTitle')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
              {today}
            </Text>

            {/* Attempts visualization */}
            <AttemptsDisplay attempts={result.attempts} solved={result.solved} />
            <Text style={[styles.attemptsLabel, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
              {t('daily.attempts', { count: result.attempts })}
            </Text>

            {/* Theme reveal */}
            <View style={[styles.themeRow, { borderColor: colors.border }]}>
              <Text style={[styles.themeLabel, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {t('daily.themeLabel')}
              </Text>
              <Text style={[styles.themeValue, { color: colors.text, fontSize: typography.size.md }]}>
                {t(`tactic.${result.theme}`, result.theme)}
              </Text>
            </View>

            {/* Reward row */}
            <View style={[styles.rewardRow, { backgroundColor: colors.surfaceAlt, borderRadius: 10 }]}>
              <Text style={[styles.rewardText, { color: colors.text, fontSize: typography.size.sm }]}>
                {rewardLabel}
              </Text>
              {result.solved ? (
                <Text style={[styles.rewardIcons, { fontSize: typography.size.md }]}>
                  👑 👑 👑 💎 💎
                </Text>
              ) : (
                <Text style={[styles.rewardIcons, { fontSize: typography.size.md }]}>
                  🥉
                </Text>
              )}
            </View>

            {/* Shareable card (native only — captureRef requires a real view) */}
            {Platform.OS !== 'web' && (
              <ShareableCard result={result} date={today} cardRef={cardRef as RefObject<View>} />
            )}

            {/* Actions */}
            <View style={styles.actions}>
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={[styles.btnShare, { borderColor: colors.accent }]}
                  onPress={handleShare}
                  disabled={isSharing}
                  accessibilityRole="button"
                  accessibilityLabel={t('daily.shareBtn')}
                >
                  <Text style={[styles.btnShareText, { color: colors.accent, fontSize: typography.size.md }]}>
                    {isSharing ? '…' : t('daily.shareBtn')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.btnContinue, { backgroundColor: colors.accent }]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('daily.continueBtn')}
              >
                <Text style={[styles.btnContinueText, { color: colors.surface, fontSize: typography.size.md }]}>
                  {t('daily.continueBtn')}
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    borderWidth:          StyleSheet.hairlineWidth,
    paddingHorizontal:    24,
    paddingTop:           28,
    paddingBottom:        40,
    alignItems:           'center',
    gap:                  14,
  },
  header:        { lineHeight: 48 },
  title:         { fontWeight: '700', textAlign: 'center' },
  subtitle:      { textAlign: 'center', opacity: 0.7 },
  squaresRow:    { flexDirection: 'row', gap: 6 },
  square:        { width: 32, height: 32, borderRadius: 4 },
  attemptsLabel: { textAlign: 'center', opacity: 0.7 },
  themeRow: {
    width:         '100%',
    borderWidth:   StyleSheet.hairlineWidth,
    borderRadius:  10,
    paddingVertical:   12,
    paddingHorizontal: 16,
    alignItems:    'center',
    gap:           4,
  },
  themeLabel:    { opacity: 0.7 },
  themeValue:    { fontWeight: '600' },
  rewardRow: {
    width:         '100%',
    paddingVertical:   12,
    paddingHorizontal: 16,
    alignItems:    'center',
    gap:           6,
  },
  rewardText:    { fontWeight: '500' },
  rewardIcons:   {},
  shareCard: {
    width:         '100%',
    borderWidth:   StyleSheet.hairlineWidth,
    borderRadius:  12,
    padding:       16,
    alignItems:    'center',
    gap:           8,
    marginTop:     4,
  },
  shareBrand:    { fontWeight: '700' },
  shareTitle:    { fontWeight: '600', textAlign: 'center' },
  shareTheme:    { opacity: 0.8 },
  shareOutcome:  { fontWeight: '600' },
  actions:       { width: '100%', gap: 10, marginTop: 6 },
  btnShare: {
    width:         '100%',
    borderWidth:   1.5,
    borderRadius:  10,
    paddingVertical: 13,
    alignItems:    'center',
  },
  btnShareText:  { fontWeight: '600' },
  btnContinue: {
    width:         '100%',
    borderRadius:  10,
    paddingVertical: 14,
    alignItems:    'center',
  },
  btnContinueText: { fontWeight: '700' },
});
