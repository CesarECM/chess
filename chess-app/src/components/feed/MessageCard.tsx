import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import type { MessageType, ProgressMessage } from '@/types';
import * as a11y from '@/constants/a11y';

interface Props {
  message:       ProgressMessage;
  height:        number;
  isActive:      boolean;
  onComplete:    () => void;
  onOpenSession?: () => void;
}

const ICONS: Record<MessageType, string> = {
  streak:              '🔥',
  milestone_solved:    '🏆',
  rank_up:             '',    // from payload.piece
  medal:               '🏅',
  personal_best_elo:   '⭐',
  perfect_run:         '🎯',
  comeback:            '💪',
  session_elo_gain:    '📈',
  weekly_summary:      '📊',
  fsrs_first_review:   '🧠',
  fsrs_mastered:       '🎓',
  fsrs_relearned:      '♻️',
  fsrs_review_session:    '📅',
  calibration_start:      '🎯',
  calibration_insight:    '🧭',
  calibration_midpoint:   '📊',
  calibration_complete:   '🏆',
  recalibration_streak:   '📈',
  perfect_run_clean:      '👑',
  reino_crown_first:      '👑',
  reino_crystal_first:    '💎',
  liga_intro:             '⚔️',
  session_gate_reached:   '🏁',
  session_progress_nudge: '🎯',
  tutorial_hint_used:     '💡',
  tutorial_retry_no_hint: '⚠️',
  tutorial_failed_final:  '💔',
  tutorial_clean_solve:   '⭐',
  chest_earned:           '🎁',
  chest_slot_full:        '📦',
};

function getIcon(message: ProgressMessage): string {
  if (message.type === 'rank_up') return message.payload.piece as string;
  if (message.type === 'milestone_solved' && (message.payload.count as number) === 1) return '🎯';
  return ICONS[message.type];
}

const MULTI_BODY_TYPES: Partial<Record<MessageType, true>> = {
  fsrs_mastered:           true,
  streak:                  true,
  fsrs_first_review:       true,
  comeback:                true,
  session_elo_gain:        true,
  fsrs_relearned:          true,
  calibration_start:       true,
  calibration_insight:     true,
  calibration_midpoint:    true,
  calibration_complete:    true,
  session_progress_nudge:  true,
};

function getBodyKey(message: ProgressMessage): string {
  if (message.type === 'perfect_run_clean') {
    return `message.perfect_run_clean.body_${message.payload.count}`;
  }
  if (message.type === 'session_gate_reached' && message.payload.firstQualityIntro) {
    return 'message.session_gate_reached.body_quality';
  }
  if (MULTI_BODY_TYPES[message.type]) {
    return `message.${message.type}.bodies.${message.payload.bodyIndex ?? 0}`;
  }
  return `message.${message.type}.body`;
}

function useTranslatedPayload(message: ProgressMessage): Record<string, unknown> {
  const { t } = useTranslation();
  if (message.type === 'rank_up') {
    return {
      ...message.payload,
      rankName: t(`elo.${message.payload.rankKey as string}`),
    };
  }
  if (message.type === 'medal') {
    return {
      ...message.payload,
      medalName: t(`medal.${message.payload.medalId as string}_label`),
    };
  }
  return message.payload;
}

function ProgressDots({ count, successColor, trackColor }: { count: number; successColor: string; trackColor: string }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: 10 }, (_, i) => (
        <View
          key={i}
          style={[dotStyles.dot, { backgroundColor: i < count ? successColor : trackColor }]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

const AUTO_ADVANCE_MS = 6000;

function MessageCardComponent({ message, height, isActive, onComplete, onOpenSession }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t }         = useTranslation();
  const isDesktop     = useIsDesktop();
  const payload       = useTranslatedPayload(message);
  const icon          = getIcon(message);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setTimeout(() => onCompleteRef.current(), AUTO_ADVANCE_MS);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [isActive]);

  const cardTitle = t(`message.${message.type}.title`, payload as Record<string, string>);

  return (
    <View
      style={[styles.card, { height, backgroundColor: colors.background }]}
      accessibilityLabel={t('a11y.messageCard.card', { title: cardTitle })}
      accessible
    >
      <View style={[
        styles.inner,
        { backgroundColor: colors.accent + '14', borderColor: colors.accent + '30', borderRadius: 20 },
        isDesktop && styles.innerDesktop,
      ]}>
        <Text
          style={[styles.icon, { color: message.type === 'rank_up' ? colors.accent : undefined }]}
          {...a11y.img(t('a11y.messageCard.icon'))}
        >
          {icon}
        </Text>

        <Text style={[styles.title, { color: colors.text, fontSize: typography.size.xl }]}>
          {cardTitle}
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary, fontSize: typography.size.md }]}>
          {t(getBodyKey(message), payload as Record<string, string>)}
        </Text>

        {message.type === 'session_progress_nudge' && (
          <ProgressDots
            count={message.payload.count as number}
            successColor={colors.success}
            trackColor={colors.textSecondary + '33'}
          />
        )}

        {message.type === 'session_gate_reached' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.success, borderRadius: 10, marginTop: spacing[4] }]}
            onPress={() => { onOpenSession?.(); onComplete(); }}
            {...a11y.btn(t('a11y.messageCard.openSession'))}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
              {t('message.session_gate_reached.cta')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 10, marginTop: spacing[4] }]}
            onPress={onComplete}
            {...a11y.btn(t('a11y.messageCard.continue'))}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
              {t('message.continue')}
            </Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

export const MessageCard = memo(MessageCardComponent);

const styles = StyleSheet.create({
  card:          { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  inner:         { width: '100%', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 28, borderWidth: 1, gap: 12 },
  innerDesktop:  { maxWidth: 480 },
  icon:    { fontSize: 56 },
  title:   { fontWeight: '700', textAlign: 'center' },
  body:    { textAlign: 'center', lineHeight: 22 },
  btn:     { paddingHorizontal: 32, paddingVertical: 12 },
  btnText: { fontWeight: '600' },
});
