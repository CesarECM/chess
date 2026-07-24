import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { testConnection } from '@/services/supabase';

export default function FeedScreen() {
  const { colors, typography } = useTheme();
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    testConnection().then((ok) => setStatus(ok ? 'ok' : 'error'));
  }, []);

  const label =
    status === 'checking' ? 'Conectando a Supabase…' :
    status === 'ok'       ? '✓ Supabase conectado' :
                            '✗ Error de conexión';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.text, { color: colors.text, fontSize: typography.size.lg }]}>
        Feed — Sprint 5
      </Text>
      <Text style={[
        styles.status,
        { fontSize: typography.size.sm },
        status === 'checking' && { color: colors.textSecondary },
        status === 'ok'       && { color: colors.success },
        status === 'error'    && { color: colors.error },
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text:      {},
  status:    {},
});
