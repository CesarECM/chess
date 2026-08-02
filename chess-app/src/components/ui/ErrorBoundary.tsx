import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', stack: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    const stack   = error instanceof Error ? (error.stack ?? '') : '';
    return { hasError: true, message, stack };
  }

  reset = () => this.setState({ hasError: false, message: '', stack: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorScreen message={this.state.message} stack={this.state.stack} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

export function ErrorScreen({
  message,
  stack,
  onRetry,
}: {
  message: string;
  stack?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={s.root}>
      <Text style={s.title}>Error al iniciar</Text>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text style={s.label}>Mensaje:</Text>
        <Text selectable style={s.message}>{message}</Text>
        {!!stack && (
          <>
            <Text style={[s.label, { marginTop: 16 }]}>Stack:</Text>
            <Text selectable style={s.stack}>{stack}</Text>
          </>
        )}
      </ScrollView>
      {onRetry && (
        <TouchableOpacity style={s.btn} onPress={onRetry}>
          <Text style={s.btnText}>Reintentar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0a0a1a', padding: 24, paddingTop: 60 },
  title:         { color: '#ff6b6b', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  label:         { color: '#666', fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  message:       { color: '#eee', fontSize: 14, lineHeight: 20 },
  stack:         { color: '#888', fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },
  btn:           { marginTop: 20, backgroundColor: '#4a90d9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, alignSelf: 'center' },
  btnText:       { color: '#fff', fontWeight: '600', fontSize: 15 },
});
