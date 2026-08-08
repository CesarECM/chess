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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { updatePassword } from '@/services/auth';
import * as a11y from '@/constants/a11y';

export default function UpdatePasswordScreen() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  async function handleUpdate() {
    if (!password) return;
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
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => router.replace('/(tabs)'), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('auth.errorUpdatePassword'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={[styles.title, { color: colors.success, fontSize: typography.size['2xl'] }]}>
          {t('auth.passwordUpdated')}
        </Text>
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
          {t('auth.updatePasswordTitle')}
        </Text>

        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder={t('auth.newPassword')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('a11y.auth.newPasswordInput')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder={t('auth.confirmNewPassword')}
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
          onPress={handleUpdate}
          disabled={loading}
          {...a11y.btn(t('a11y.auth.savePasswordBtn'))}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.btnText, { fontSize: typography.size.md }]}>{t('auth.updatePassword')}</Text>
          }
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
});
