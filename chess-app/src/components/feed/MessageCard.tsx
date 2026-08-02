import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import type { MessageType, ProgressMessage } from '@/types';

interface Props {
  message: ProgressMessage;
  height:  number;
  onComplete: () => void;
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
};

function getIcon(message: ProgressMessage): string {
  if (message.type === 'rank_up') return message.payload.piece as string;
  if (message.type === 'milestone_solved' && (message.payload.count as number) === 1) return '🎯';
  return ICONS[message.type];
}

const MULTI_BODY_TYPES: Partial<Record<MessageType, true>> = {
  fsrs_mastered:          true,
  streak:                 true,
  fsrs_first_review:      true,
  comeback:               true,
  session_elo_gain:       true,
  fsrs_relearned:         true,
  calibration_start:      true,
  calibration_insight:    true,
  calibration_midpoint:   true,
  calibration_complete:   true,
};

function getBodyKey(message: ProgressMessage): string {
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

function MessageCardComponent({ message, height, onComplete }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t }       = useTranslation();
  const isDesktop   = useIsDesktop();
  const payload     = useTranslatedPayload(message);
  const icon        = getIcon(message);

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <View style={[
        styles.inner,
        { backgroundColor: colors.accent + '14', borderColor: colors.accent + '30', borderRadius: 20 },
        isDesktop && styles.innerDesktop,
      ]}>
        <Text style={[styles.icon, { color: message.type === 'rank_up' ? colors.accent : undefined }]}>
          {icon}
        </Text>

        <Text style={[styles.title, { color: colors.text, fontSize: typography.size.xl }]}>
          {t(`message.${message.type}.title`, payload as Record<string, string>)}
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary, fontSize: typography.size.md }]}>
          {t(getBodyKey(message), payload as Record<string, string>)}
        </Text>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 10, marginTop: spacing[4] }]}
          onPress={onComplete}
        >
          <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
            {t('message.continue')}
          </Text>
        </TouchableOpacity>
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
