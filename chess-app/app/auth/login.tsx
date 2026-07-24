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
import { useRouter, type Href } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { signIn, signInWithGoogle } from '@/services/auth';

export default function LoginScreen() {
  const { colors, typography, radius } = useTheme();
  const router = useRouter();
  const { setGuest } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error con Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.size['2xl'] }]}>
          ♟ Chess Puzzles
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
          placeholder="Contraseña"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />

        {error ? <Text style={[styles.error, { color: colors.error, fontSize: typography.size.sm }]}>{error}</Text> : null}

        <Pressable style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.md }]} onPress={handleSignIn} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.btnText, { fontSize: typography.size.md }]}>Iniciar sesión</Text>
          }
        </Pressable>

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.sm, marginHorizontal: 8 }}>o</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <Pressable style={[styles.btnOutline, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }]} onPress={handleGoogle} disabled={loading}>
          <Text style={[styles.btnOutlineText, { color: colors.text, fontSize: typography.size.md }]}>
            Continuar con Google
          </Text>
        </Pressable>

        <Pressable style={styles.link} onPress={() => router.push('/auth/register' as Href)}>
          <Text style={{ color: colors.accent, fontSize: typography.size.sm }}>
            ¿No tienes cuenta? Regístrate
          </Text>
        </Pressable>

        <Pressable style={styles.link} onPress={setGuest}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.xs }}>
            Continuar sin cuenta
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  inner:        { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title:        { fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  input:        { borderWidth: 1, padding: 14 },
  btn:          { padding: 14, alignItems: 'center' },
  btnText:      { color: '#fff', fontWeight: '600' },
  btnOutline:   { borderWidth: 1, padding: 14, alignItems: 'center' },
  btnOutlineText: {},
  divider:      { flexDirection: 'row', alignItems: 'center' },
  dividerLine:  { flex: 1, height: 1 },
  error:        { textAlign: 'center' },
  link:         { alignItems: 'center', paddingVertical: 4 },
});
