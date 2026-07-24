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

import { useTheme } from '@/hooks/useTheme';
import { signUp } from '@/services/auth';

export default function RegisterScreen() {
  const { colors, typography, radius } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleRegister() {
    if (!email.trim() || !password) return;
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { session } = await signUp(email.trim(), password);
      if (!session) {
        // Supabase sent confirmation email
        setSuccess(true);
      }
      // if session exists, onAuthStateChange in initAuth redirects automatically
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: 24, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.size['2xl'], marginBottom: 12 }]}>
          Revisa tu email
        </Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: typography.size.md, marginBottom: 32 }}>
          Te enviamos un link de confirmación a {email}. Una vez confirmado, inicia sesión.
        </Text>
        <Pressable onPress={() => router.replace('/auth/login')}>
          <Text style={{ color: colors.accent, fontSize: typography.size.sm }}>Ir al inicio de sesión</Text>
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
          Crear cuenta
        </Text>

        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder="Contraseña (mín. 6 caracteres)"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, fontSize: typography.size.md }]}
          placeholder="Confirmar contraseña"
          placeholderTextColor={colors.textSecondary}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
        />

        {error ? <Text style={[styles.error, { color: colors.error, fontSize: typography.size.sm }]}>{error}</Text> : null}

        <Pressable style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.md }]} onPress={handleRegister} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.btnText, { fontSize: typography.size.md }]}>Crear cuenta</Text>
          }
        </Pressable>

        <Pressable style={styles.link} onPress={() => router.back()}>
          <Text style={{ color: colors.accent, fontSize: typography.size.sm }}>
            ¿Ya tienes cuenta? Inicia sesión
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
