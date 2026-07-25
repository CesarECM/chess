import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';

const FAQ_KEYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export default function FAQScreen() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggle(key: string) {
    setExpanded((prev) => (prev === key ? null : key));
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.inner}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: colors.accent, fontSize: typography.size.md }]}>
          ‹ {t('settings.sectionLegal')}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.text, fontSize: typography.size['2xl'] }]}>
        {t('faq.title')}
      </Text>

      <View style={styles.list}>
        {FAQ_KEYS.map((key) => {
          const isOpen = expanded === key;
          return (
            <View
              key={key}
              style={[
                styles.item,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
              ]}
            >
              <TouchableOpacity
                style={styles.question}
                onPress={() => toggle(key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.questionText, { color: colors.text, fontSize: typography.size.md }]}>
                  {t(`faq.q${key}`)}
                </Text>
                <Text style={[{ color: colors.textSecondary, fontSize: typography.size.lg }]}>
                  {isOpen ? '−' : '+'}
                </Text>
              </TouchableOpacity>
              {isOpen && (
                <Text
                  style={[
                    styles.answer,
                    { color: colors.textSecondary, fontSize: typography.size.sm, borderTopColor: colors.border },
                  ]}
                >
                  {t(`faq.a${key}`)}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner:     { padding: 16, paddingTop: 60, paddingBottom: 40 },
  backBtn:   { marginBottom: 20 },
  backText:  { fontWeight: '600' },
  title:     { fontWeight: '700', marginBottom: 24 },
  list:      { gap: 12 },
  item:      { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  question:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  questionText: { flex: 1, fontWeight: '600', marginRight: 12, lineHeight: 22 },
  answer:    { paddingHorizontal: 16, paddingBottom: 16, lineHeight: 20, borderTopWidth: StyleSheet.hairlineWidth },
});
