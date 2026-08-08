import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { signUp, syncDisplayNameToSupabase } from '@/services/auth';
import { analytics } from '@/services/analytics';
import { useUserStore } from '@/stores/useUserStore';
import * as a11y from '@/constants/a11y';

export default function RegisterScreen() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const storeDisplayName = useUserStore((s) => s.displayName);
  const setDisplayName   = useUserStore((s) => s.setDisplayName);

  const [name, setName]       = useState(storeDisplayName);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleRegister() {
    if (!email.trim() || !password) return;
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { session } = await signUp(email.trim(), password);
      const trimmedName = name.trim();
      if (trimmedName) setDisplayName(trimmedName);
      analytics.track('registration_completed');
      if (session) {
        if (trimmedName) syncDisplayNameToSupabase(session.user.id, trimmedName).catch(() => {});
        router.replace(returnTo === 'subscription' ? '/subscription' : '/');
      } else {
        setSuccess(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('auth.errorRegister'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: 24, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.size['2xl'], marginBottom: 12 }]}>
          {t('auth.checkEmail')}
        </Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: typography.size.md, marginBottom: 32 }}>
          {t('auth.emailSent', { email })}
        </Text>
        <Pressable onPress={() => router.replace('/auth/login')}>
          <Text style={{ color: colors.accent, fontSize: typography.size.sm }}>{t('auth.goToLogin')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.size['2xl'] }]}>
          {t('auth.createAccount')}
        </Text>

        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder={t('auth.nameOptional')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('a11y.auth.nameInput')}
          value={name}
          onChangeText={(v) => setName(v.slice(0, 20))}
          maxLength={20}
          autoCapitalize="words"
          autoComplete="name"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('a11y.auth.emailInput')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder={t('auth.passwordMin')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('a11y.auth.passwordInput')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder={t('auth.confirmPassword')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('a11y.auth.confirmPasswordInput')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
        />

        {error ? <Text style={[styles.error, { color: colors.error, fontSize: typography.size.sm }]} {...a11y.alert(error)}>{error}</Text> : null}

        <Pressable
          style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.md }]}
          onPress={handleRegister}
          disabled={loading}
          {...a11y.btn(t('a11y.auth.createBtn'))}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.btnText, { fontSize: typography.size.md }]}>{t('auth.createAccount')}</Text>
          }
        </Pressable>

        <Pressable style={styles.link} onPress={() => router.back()} {...a11y.btn(t('a11y.auth.backToSignIn'))}>
          <Text style={{ color: colors.accent, fontSize: typography.size.sm }}>
            {t('auth.hasAccount')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  inner:   { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title:   { fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  input:   { borderWidth: 1, padding: 14 },
  btn:     { padding: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  error:   { textAlign: 'center' },
  link:    { alignItems: 'center', paddingVertical: 4 },
});
