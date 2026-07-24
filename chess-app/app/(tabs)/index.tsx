import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { testConnection } from '@/services/supabase';

export default function FeedScreen() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    testConnection().then((ok) => setStatus(ok ? 'ok' : 'error'));
  }, []);

  const label =
    status === 'checking' ? 'Conectando a Supabase…' :
    status === 'ok'       ? '✓ Supabase conectado' :
                            '✗ Error de conexión';

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Feed — Sprint 5</Text>
      <Text style={[styles.status, styles[status]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text:      { fontSize: 18 },
  status:    { fontSize: 14 },
  checking:  { color: '#888' },
  ok:        { color: '#22c55e' },
  error:     { color: '#ef4444' },
});
