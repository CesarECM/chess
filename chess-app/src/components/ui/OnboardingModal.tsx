import { Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';
import { BOARD_THEMES, PIECE_SETS } from '@/constants/boardThemes';
import { getPieceUrl } from '@/constants/pieceSets';
import type { BoardThemeId, PieceSetId } from '@/constants/boardThemes';

const LEVELS = [
  { key: 'beginner',     elo: 600  },
  { key: 'casual',       elo: 800  },
  { key: 'intermediate', elo: 1000 },
  { key: 'advanced',     elo: 1200 },
  { key: 'expert',       elo: 1800 },
] as const;

type LevelKey = typeof LEVELS[number]['key'];

export function OnboardingModal() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const onboardingCompleted = useUserStore((s) => s.onboardingCompleted);
  const gdprConsentDate     = useUserStore((s) => s.gdprConsentDate);
  const completeOnboarding  = useUserStore((s) => s.completeOnboarding);
  const currentBoardTheme   = useUserStore((s) => s.boardTheme);
  const currentPieceSet     = useUserStore((s) => s.pieceSet);

  const [step, setStep]             = useState<0 | 1>(0);
  const [selectedLevel, setLevel]   = useState<LevelKey>('casual');
  const [selectedTheme, setTheme]   = useState<BoardThemeId>(currentBoardTheme);
  const [selectedPieces, setPieces] = useState<PieceSetId>(currentPieceSet);

  // Show for every user (guest or registered) after GDPR is accepted
  const visible = !onboardingCompleted && gdprConsentDate !== null;

  function handleContinue() {
    if (step === 0) {
      setStep(1);
      return;
    }
    const level = LEVELS.find((l) => l.key === selectedLevel)!;
    completeOnboarding(level.elo, selectedTheme, selectedPieces, selectedLevel);
  }

  function handleSkip() {
    completeOnboarding(1000, currentBoardTheme, currentPieceSet, 'intermediate');
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          {/* Step dots */}
          <View style={styles.dots}>
            {([0, 1] as const).map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: step === i ? colors.accent : colors.border },
                ]}
              />
            ))}
          </View>

          {step === 0 ? (
            <>
              <Text style={[styles.title, { color: colors.text, fontSize: typography.size.lg }]}>
                {t('onboarding.levelTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {t('onboarding.levelSubtitle')}
              </Text>

              <ScrollView style={styles.levelList} showsVerticalScrollIndicator={true}>
                {LEVELS.map((level) => {
                  const active = selectedLevel === level.key;
                  return (
                    <TouchableOpacity
                      key={level.key}
                      onPress={() => setLevel(level.key)}
                      style={[
                        styles.levelRow,
                        {
                          borderColor: active ? colors.accent : colors.border,
                          borderRadius: radius.md,
                          backgroundColor: active ? colors.accent + '18' : 'transparent',
                        },
                      ]}
                    >
                      <View style={styles.levelText}>
                        <Text style={[styles.levelName, { color: colors.text, fontSize: typography.size.md }]}>
                          {t(`onboarding.level_${level.key}`)}
                        </Text>
                        <Text style={[styles.levelDesc, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                          {t(`onboarding.level_${level.key}_desc`)}
                        </Text>
                      </View>
                      <Text style={[styles.levelElo, { color: active ? colors.accent : colors.textSecondary, fontSize: typography.size.xs }]}>
                        {level.elo}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text, fontSize: typography.size.lg }]}>
                {t('onboarding.themeTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {t('onboarding.themeSubtitle')}
              </Text>

              {/* Board color */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                {t('settings.boardThemeLabel')}
              </Text>
              <View style={styles.themeRow}>
                {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => {
                  const th = BOARD_THEMES[id];
                  const active = selectedTheme === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => setTheme(id)}
                      style={[
                        styles.themeChip,
                        {
                          borderColor: active ? colors.accent : 'transparent',
                          borderRadius: radius.md,
                        },
                      ]}
                    >
                      <View style={styles.themePreview}>
                        <View style={[styles.themeHalf, { backgroundColor: th.light }]} />
                        <View style={[styles.themeHalf, { backgroundColor: th.dark }]} />
                      </View>
                      <Text style={[styles.themeLabel, { color: active ? colors.accent : colors.textSecondary, fontSize: typography.size.xs }]}>
                        {t(`settings.boardTheme${id.charAt(0).toUpperCase() + id.slice(1)}` as never)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Piece set — web only */}
              {Platform.OS === 'web' && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 16 }]}>
                    {t('settings.pieceSetLabel')}
                  </Text>
                  <View style={styles.pieceRow}>
                    {PIECE_SETS.map((id) => {
                      const active = selectedPieces === id;
                      return (
                        <TouchableOpacity
                          key={id}
                          onPress={() => setPieces(id)}
                          style={[
                            styles.pieceChip,
                            {
                              borderColor: active ? colors.accent : colors.border,
                              borderRadius: radius.md,
                              backgroundColor: active ? colors.accent + '18' : 'transparent',
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: getPieceUrl(id, 'wQ') }}
                            style={styles.queenImg}
                          />
                          <Text style={[styles.themeLabel, { color: active ? colors.accent : colors.textSecondary, fontSize: typography.size.xs }]}>
                            {t(`settings.pieceSet${id.charAt(0).toUpperCase() + id.slice(1)}` as never)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.sm }]}
            onPress={handleContinue}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
              {step === 0 ? t('onboarding.continue') : t('onboarding.start')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={[styles.skipText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {t('onboarding.skip')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 24 },
  card:         { padding: 24 },
  dots:         { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 20 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  title:        { fontWeight: '700', marginBottom: 6 },
  subtitle:     { lineHeight: 20, marginBottom: 20 },
  sectionLabel: { fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
  // Level step
  levelList:    { maxHeight: 300 },
  levelRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, padding: 14, marginBottom: 8 },
  levelText:    { flex: 1, gap: 2 },
  levelName:    { fontWeight: '600' },
  levelDesc:    { lineHeight: 16 },
  levelElo:     { fontWeight: '700', marginLeft: 8 },
  // Theme step
  themeRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  themeChip:    { alignItems: 'center', gap: 6, padding: 8, borderWidth: 2 },
  themePreview: { flexDirection: 'row', width: 48, height: 48, borderRadius: 6, overflow: 'hidden' },
  themeHalf:    { flex: 1 },
  themeLabel:   { fontWeight: '600' },
  // Piece set step
  pieceRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  pieceChip:    { alignItems: 'center', gap: 6, padding: 10, borderWidth: 1.5 },
  queenImg:     { width: 44, height: 44 },
  // CTA
  btn:          { paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnText:      { fontWeight: '700' },
  skipBtn:      { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  skipText:     {},
});
