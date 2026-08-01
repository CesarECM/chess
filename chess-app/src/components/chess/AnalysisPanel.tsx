import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { EvalBar } from './EvalBar';
import type { AnalysisState } from '@/services/analysis/useAnalysis';

interface AnalysisPanelProps {
  state: AnalysisState;
  isVisible: boolean;
  onClose: () => void;
  bestMoveArrow?: { from: string; to: string } | null;
}

function cpLabel(cp: number | null, mate: number | null): string {
  if (mate !== null) return mate > 0 ? `Mate en ${mate}` : `Mate en ${-mate} (rival)`;
  if (cp === null || Math.abs(cp) < 15) return 'Posición igualada';
  const sign = cp > 0 ? '+' : '';
  return `${sign}${(cp / 100).toFixed(2)} peones`;
}

export function AnalysisPanel({ state, isVisible, onClose }: AnalysisPanelProps) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const topCp   = state.status === 'ready' ? (state.result.pvs[0]?.cp  ?? null) : null;
  const topMate = state.status === 'ready' ? (state.result.pvs[0]?.mate ?? null) : null;

  const content = (
    <View style={[styles.card, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.size.sm }]}>
          {t('analysis.title')}
        </Text>
        {state.status === 'ready' && (
          <Text style={[styles.depth, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('analysis.depth', { depth: state.result.depth })}
          </Text>
        )}
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.md }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {state.status === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.hint, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('analysis.loading')}
          </Text>
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.centered}>
          <Text style={[styles.hint, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
            {t('analysis.unavailable')}
          </Text>
        </View>
      )}

      {state.status === 'ready' && (
        <View style={styles.body}>
          <EvalBar cp={topCp} mate={topMate} />
          <View style={styles.lines}>
            {state.result.pvs.map((pv, i) => {
              const firstMove = pv.moves?.split(' ')[0] ?? '';
              const evalStr   = pv.mate != null
                ? (pv.mate > 0 ? `M${pv.mate}` : `M${-pv.mate}`)
                : pv.cp != null ? `${pv.cp > 0 ? '+' : ''}${(pv.cp / 100).toFixed(1)}` : '=';
              return (
                <View key={i} style={styles.pvRow}>
                  <Text style={[styles.pvEval, { color: colors.text, fontSize: typography.size.xs, fontWeight: '700' }]}>
                    {evalStr}
                  </Text>
                  <Text style={[styles.pvMoves, { color: colors.textSecondary, fontSize: typography.size.xs }]} numberOfLines={1}>
                    {pv.moves ?? ''}
                  </Text>
                </View>
              );
            })}
            <Text style={[styles.posDesc, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 8 }]}>
              {cpLabel(topCp, topMate)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  if (Platform.OS === 'web') {
    if (!isVisible) return null;
    return (
      <Pressable style={styles.webOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          {content}
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          {content}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  webOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  card: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    minHeight: 220,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  title: {
    fontWeight: '700',
    flex: 1,
  },
  depth: {
    opacity: 0.6,
  },
  closeBtn: {
    padding: 4,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  hint: {
    textAlign: 'center',
  },
  body: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
    minHeight: 120,
  },
  lines: {
    flex: 1,
  },
  pvRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  pvEval: {
    minWidth: 36,
  },
  pvMoves: {
    flex: 1,
    fontFamily: 'monospace' as const,
  },
  posDesc: {
    fontStyle: 'italic',
  },
});
