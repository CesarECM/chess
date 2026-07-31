import { useCallback, useRef } from 'react';
import {
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface DebugEntry {
  ts: number;
  tag: string;
  msg: string;
}

interface Props {
  entries: DebugEntry[];
  onClose: () => void;
  onClear: () => void;
}

async function copyText(text: string) {
  if (Platform.OS === 'web') {
    try { await (navigator as Navigator & { clipboard: Clipboard }).clipboard.writeText(text); } catch { /* ignore */ }
  } else {
    await Share.share({ message: text });
  }
}

const TAG_COLORS: Record<string, string> = {
  INIT:     '#4fc3f7',
  PREFETCH: '#81c784',
  BUFFER:   '#ffb74d',
  SOLVE:    '#ce93d8',
  SKIP:     '#ef9a9a',
  MESSAGES: '#fff176',
  ERROR:    '#ff5252',
};

function fmt(ts: number) {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

export function DebugPanel({ entries, onClose, onClear }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  const handleCopy = useCallback(async () => {
    const text = entries
      .map((e) => `[${fmt(e.ts)}] [${e.tag}] ${e.msg}`)
      .join('\n');
    await copyText(text || '(sin logs)');
  }, [entries]);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.panel}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>DEBUG ({entries.length})</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={onClear} style={styles.btn}>
              <Text style={styles.btnText}>Limpiar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCopy} style={[styles.btn, styles.btnCopy]}>
              <Text style={styles.btnText}>Copiar todo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnClose]}>
              <Text style={styles.btnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Log list */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {entries.length === 0 && (
            <Text style={styles.empty}>Sin eventos aún…</Text>
          )}
          {entries.map((e, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.ts}>{fmt(e.ts)}</Text>
              <Text style={[styles.tag, { color: TAG_COLORS[e.tag] ?? '#aaa' }]}>
                [{e.tag}]
              </Text>
              <Text style={styles.msg}>{e.msg}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  panel: {
    height: '55%',
    backgroundColor: 'rgba(10,10,20,0.95)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: 'monospace' },
  headerButtons: { flexDirection: 'row', gap: 6 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  btnCopy: { backgroundColor: '#1565c0' },
  btnClose: { backgroundColor: '#555' },
  btnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  scroll: { flex: 1, paddingHorizontal: 8 },
  empty: { color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 12, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
    gap: 4,
  },
  ts:  { color: '#888', fontSize: 10, fontFamily: 'monospace' },
  tag: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  msg: { color: '#ddd', fontSize: 10, fontFamily: 'monospace', flexShrink: 1 },
});
