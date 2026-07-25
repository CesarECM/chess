import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Algo salió mal</Text>
          <Text style={styles.detail} numberOfLines={4}>{this.state.message}</Text>
          <TouchableOpacity style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0a0a1a' },
  title:     { color: '#ff6b6b', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  detail:    { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  btn:       { backgroundColor: '#4a90d9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText:   { color: '#fff', fontWeight: '600', fontSize: 15 },
});
