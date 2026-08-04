import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { analytics } from '@/services/analytics';

interface Props {
  visible: boolean;
  streakDays: number;
  sessionTotalSolved: number;
  sessionTotalFailed: number;
  sessionStartTime: number | null;
  onClose: () => void;
}

type HighlightStat = 'streak' | 'accuracy' | 'puzzles' | 'time';

function selectHighlightStat(
  streakDays: number,
  sessionTotalSolved: number,
  sessionTotalFailed: number,
): HighlightStat {
  const total = sessionTotalSolved + sessionTotalFailed;
  const accuracy = total > 0 ? sessionTotalSolved / total : 0;

  if (streakDays > 3) return 'streak';
  if (accuracy > 0.80 && total >= 3) return 'accuracy';
  if (sessionTotalSolved >= 5) return 'puzzles';
  return 'time';
}

function formatDuration(startTime: number | null): string {
  if (!startTime) return '—';
  const secs = Math.round((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function SessionEndModal({
  visible,
  streakDays,
  sessionTotalSolved,
  sessionTotalFailed,
  sessionStartTime,
  onClose,
}: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const total = sessionTotalSolved + sessionTotalFailed;
  const accuracy = total > 0 ? Math.round((sessionTotalSolved / total) * 100) : 0;
  const durationMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
  const durationS = Math.round(durationMs / 1000);
  const highlight = selectHighlightStat(streakDays, sessionTotalSolved, sessionTotalFailed);

  const handleClose = () => {
    analytics.track('session_ended', {
      puzzles_solved:    sessionTotalSolved,
      puzzles_failed:    sessionTotalFailed,
      session_duration_s: durationS,
      accuracy_pct:      accuracy,
      end_reason:        'manual',
    });
    onClose();
  };

  const highlightValue = (() => {
    switch (highlight) {
      case 'streak':   return `${streakDays} ${t('session_end.days')}`;
      case 'accuracy': return `${accuracy}%`;
      case 'puzzles':  return `${sessionTotalSolved}`;
      case 'time':     return formatDuration(sessionStartTime);
    }
  })();

  const highlightLabel = t(`session_end.stat_${highlight}`);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.size.lg }]}>
            {t('session_end.modal_title')}
          </Text>

          <View style={[styles.highlight, { backgroundColor: colors.accent + '1A' }]}>
            <Text style={[styles.highlightValue, { color: colors.accent }]}>
              {highlightValue}
            </Text>
            <Text style={[styles.highlightLabel, { color: colors.textSecondary }]}>
              {highlightLabel}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>{sessionTotalSolved}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('session_end.solved')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.error }]}>{sessionTotalFailed}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('session_end.failed')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatDuration(sessionStartTime)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('session_end.time')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, { color: '#fff', fontSize: typography.size.md }]}>
              {t('session_end.continue_button')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 20,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
  },
  highlight: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
  },
  highlightValue: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 54,
  },
  highlightLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontWeight: '700',
  },
});
