import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useReinoStore } from '@/stores/useReinoStore';
import { CRYSTALS_PER_LIFE, LIFE_RECHARGE_HOURS } from '@/constants/reino';
import { showRewardedAdForFreeze } from '@/services/ads';
import { analytics } from '@/services/analytics';
import { scheduleBackgroundNotifications } from '@/services/notifications';

interface SummaryStats { solved: number; failed: number; durationMs: number }

interface Props {
  visible:                      boolean;
  isComplete:                   boolean;      // gate reached, not yet confirmed
  isResumen:                    boolean;      // already completed today
  isBlockedByLives:             boolean;      // opened because lives = 0
  streakDays:                   number;
  sessionTotalSolved:           number;
  sessionTotalFailed:           number;
  sessionStartTime:             number | null;
  summaryStats:                 SummaryStats | null;  // saved stats shown in resumen mode
  sessionFirstAttemptSolvedCount: number;
  onClose:                      () => void;
  onComplete:                   () => void;
}

function formatDuration(startTime: number | null): string {
  if (!startTime) return '—';
  const secs = Math.round((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSecs = Math.ceil(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DaySessionModal({
  visible,
  isComplete,
  isResumen,
  isBlockedByLives,
  streakDays,
  sessionTotalSolved,
  sessionTotalFailed,
  sessionStartTime,
  summaryStats,
  sessionFirstAttemptSolvedCount,
  onClose,
  onComplete,
}: Props) {
  const { colors, typography } = useTheme();
  const lives    = useReinoStore((s) => s.lives);
  const crystals = useReinoStore((s) => s.crystals);
  const gainLife           = useReinoStore((s) => s.gainLife);
  const redeemCrystalForLife = useReinoStore((s) => s.redeemCrystalForLife);

  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown to next life recharge
  useEffect(() => {
    if (!visible || lives.current >= lives.max) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    const msPerLife = LIFE_RECHARGE_HOURS * 3_600_000;
    const tick = () => {
      const elapsed = Date.now() - new Date(lives.lastRechargeAt).getTime();
      setCountdown(Math.max(0, msPerLife - (elapsed % msPerLife)));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [visible, lives.current, lives.max, lives.lastRechargeAt]);

  const handleWatchAd = () => {
    if (Platform.OS === 'web') return;
    showRewardedAdForFreeze(() => gainLife('ad'));
  };

  const handleRedeemCrystal = () => {
    redeemCrystalForLife();
  };

  const handleGoToReino = () => {
    onClose();
    router.push('/(tabs)/reino');
  };

  const handleComplete = () => {
    analytics.track('session_ended', {
      puzzles_solved:    sessionTotalSolved,
      puzzles_failed:    sessionTotalFailed,
      accuracy_pct:      sessionTotalSolved + sessionTotalFailed > 0
        ? Math.round((sessionTotalSolved / (sessionTotalSolved + sessionTotalFailed)) * 100) : 0,
      end_reason:        'manual',
    });
    scheduleBackgroundNotifications(streakDays).catch(console.error);
    onComplete();
  };

  const canRedeemCrystal = crystals >= CRYSTALS_PER_LIFE && lives.current < lives.max;
  const livesBlocked     = isBlockedByLives && lives.current === 0;

  const statusLabel = isResumen ? 'Resumen del día ✓' : isComplete ? 'Sesión completa ✓' : 'Sesión activa';
  const statusColor = isResumen || isComplete ? colors.success : colors.accent;

  // In resumen mode, show saved stats; otherwise show live session stats
  const displaySolved   = isResumen && summaryStats ? summaryStats.solved   : sessionTotalSolved;
  const displayFailed   = isResumen && summaryStats ? summaryStats.failed   : sessionTotalFailed;
  const displayDuration = isResumen && summaryStats
    ? (() => {
        const secs = Math.round(summaryStats.durationMs / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
      })()
    : formatDuration(sessionStartTime);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>

          {/* ── Header ─────────────────────────────────────────── */}
          <Text style={[styles.status, { color: statusColor, fontSize: typography.size.md }]}>
            {statusLabel}
          </Text>

          {/* ── Streak highlight (resumen only) ─────────────────── */}
          {isResumen && (
            <View style={[styles.streakBox, { backgroundColor: colors.success + '18' }]}>
              {streakDays <= 1 ? (
                <>
                  <Text style={[styles.streakValue, { color: colors.success }]}>🔥</Text>
                  <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>
                    {streakDays === 0 ? 'Primera sesión completada' : 'Día 1 de tu racha — no la rompas'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.streakValue, { color: colors.success }]}>{streakDays}</Text>
                  <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>días de racha 🔥</Text>
                  {streakDays >= 7 && streakDays % 7 !== 0 && (
                    <Text style={[styles.streakHint, { color: colors.textSecondary }]}>
                      {`Faltan ${7 - (streakDays % 7)} días para tu próximo freeze 🧊`}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {/* ── Stats row ──────────────────────────────────────── */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>{displaySolved}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Resueltos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.error }]}>{displayFailed}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Fallados</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{displayDuration}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tiempo</Text>
            </View>
          </View>

          {/* ── Session progress dots (N/10 clean solves) ─────── */}
          <View style={styles.dotsRow}>
            {Array.from({ length: 10 }, (_, i) => {
              const filled = isResumen ? true : i < sessionFirstAttemptSolvedCount;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: filled ? colors.success : colors.textSecondary + '33' },
                  ]}
                />
              );
            })}
          </View>

          {/* ── Lives recharge section (when blocked by 0 lives) ── */}
          {livesBlocked && (
            <View style={[styles.rechargeBox, { backgroundColor: colors.error + '15', borderColor: colors.error + '40' }]}>
              <Text style={[styles.rechargeTitle, { color: colors.error }]}>
                ❤️ Sin vidas — próxima en {formatCountdown(countdown)}
              </Text>

              <TouchableOpacity
                style={[styles.rechargeBtn, { backgroundColor: colors.accent }]}
                onPress={handleWatchAd}
                disabled={Platform.OS === 'web'}
                activeOpacity={0.8}
              >
                <Text style={[styles.rechargeBtnText, { color: '#fff' }]}>
                  {Platform.OS === 'web' ? '📺 Ver anuncio (nativo)' : '📺 Ver anuncio → +1 ❤️'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rechargeBtn, {
                  backgroundColor: canRedeemCrystal ? colors.accent + 'CC' : colors.textSecondary + '33',
                }]}
                onPress={handleRedeemCrystal}
                disabled={!canRedeemCrystal}
                activeOpacity={0.8}
              >
                <Text style={[styles.rechargeBtnText, { color: canRedeemCrystal ? '#fff' : colors.textSecondary }]}>
                  💎 Usar {CRYSTALS_PER_LIFE} cristales → +1 ❤️
                  {!canRedeemCrystal ? `  (tienes ${crystals})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Complete session button (only when gate reached and not yet confirmed) ── */}
          {isComplete && !isResumen && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.success }]}
              onPress={handleComplete}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, { color: '#fff', fontSize: typography.size.md }]}>
                Completar sesión del día →
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Ir al Reino ───────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.reinoBtn, { borderColor: colors.accent + '66' }]}
            onPress={handleGoToReino}
            activeOpacity={0.8}
          >
            <Text style={[styles.reinoBtnText, { color: colors.accent }]}>
              🏰 Ir al Reino →
            </Text>
          </TouchableOpacity>

          {/* ── Close / Seguir jugando ─────────────────────────── */}
          {!livesBlocked && (
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                {isResumen || isComplete ? 'Cerrar' : 'Seguir jugando'}
              </Text>
            </TouchableOpacity>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card:            { width: '100%', borderRadius: 20, padding: 24, alignItems: 'center', gap: 16 },
  status:          { fontWeight: '700', textAlign: 'center' },
  statsRow:        { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  statItem:        { alignItems: 'center', gap: 2 },
  statValue:       { fontSize: 22, fontWeight: '700' },
  statLabel:       { fontSize: 12, fontWeight: '500' },
  dotsRow:       { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  rechargeBox:     { width: '100%', borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, alignItems: 'center' },
  rechargeTitle:   { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  rechargeBtn:     { width: '100%', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  rechargeBtnText: { fontSize: 13, fontWeight: '700' },
  primaryBtn:      { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText:  { fontWeight: '700' },
  reinoBtn:        { width: '100%', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  reinoBtnText:    { fontSize: 14, fontWeight: '700' },
  closeText:       { fontSize: 13, fontWeight: '500', paddingVertical: 4 },
  streakBox:       { width: '100%', borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 4 },
  streakValue:     { fontSize: 48, fontWeight: '800', lineHeight: 54 },
  streakLabel:     { fontSize: 14, fontWeight: '600' },
  streakHint:      { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
