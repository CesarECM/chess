import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Chess } from 'chess.js';
import type { Square, PieceSymbol, Move } from 'chess.js';

import { applyMove } from '@/services/chess';

export interface ChessboardRef {
  move: (p: { from: Square; to: Square; promotion?: PieceSymbol }) => Promise<Move | undefined>;
  undo: () => Move | null;
  highlight: (p: { square: Square; color?: string }) => void;
  resetAllHighlightedSquares: () => void;
  resetBoard: (fen?: string, opts?: unknown) => void;
  getState: () => unknown;
}

export type Orientation = 'white' | 'black' | 'auto';

interface ChessBoardProps {
  fen: string;
  orientation?: Orientation;
  onMove?: (uciMove: string, newFen: string) => void;
  onIllegalMove?: (from: string, to: string) => void;
  enabled?: boolean;
}

const UNICODE: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const SIZE  = 350;
const SQ    = SIZE / 8;

function parseFen(fen: string): Record<string, string> {
  try {
    const chess = new Chess(fen);
    const out: Record<string, string> = {};
    for (const rank of RANKS)
      for (const file of FILES) {
        const sq = `${file}${rank}` as Square;
        const p  = chess.get(sq);
        if (p) out[sq] = `${p.color}${p.type}`;
      }
    return out;
  } catch { return {}; }
}

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  ({ fen, orientation = 'auto', onMove, onIllegalMove, enabled = true }, ref) => {
    const [highlights, setHighlights] = useState<Record<string, string>>({});
    const [selected,   setSelected]   = useState<Square | null>(null);

    const flipped = orientation === 'black' ||
      (orientation === 'auto' && fen.split(' ')[1] === 'b');

    const ranks = flipped ? [...RANKS].reverse() : RANKS;
    const files = flipped ? [...FILES].reverse() : FILES;

    useImperativeHandle(ref, () => ({
      move:  () => Promise.resolve(undefined),
      undo:  () => null,
      highlight: ({ square, color }) =>
        setHighlights(h => ({ ...h, [square]: color ?? 'rgba(255,255,0,0.5)' })),
      resetAllHighlightedSquares: () => setHighlights({}),
      resetBoard: () => { setHighlights({}); setSelected(null); },
      getState: () => ({}),
    }), []);

    const pieces = parseFen(fen);

    const handleTap = useCallback((sq: Square) => {
      if (!enabled) return;

      if (!selected) {
        if (pieces[sq]) setSelected(sq);
        return;
      }

      if (selected === sq) { setSelected(null); return; }

      // Try move; fall back to queen promotion
      const base = `${selected}${sq}`;
      const prom = `${base}q`;
      const newFen = applyMove(fen, base) ?? applyMove(fen, prom);
      const uci    = applyMove(fen, base) ? base : prom;

      if (newFen) {
        setSelected(null);
        onMove?.(uci, newFen);
      } else {
        onIllegalMove?.(selected, sq);
        setSelected(pieces[sq] ? sq : null);
      }
    }, [enabled, selected, pieces, fen, onMove, onIllegalMove]);

    return (
      <View style={styles.board}>
        {ranks.map((rank, ri) => (
          <View key={rank} style={styles.row}>
            {files.map((file, fi) => {
              const sq        = `${file}${rank}` as Square;
              const isLight   = (ri + fi) % 2 === 0;
              const piece     = pieces[sq];
              const isSelected = selected === sq;
              const hlColor   = highlights[sq];

              const bgColor = isSelected
                ? 'rgba(20,85,30,0.75)'
                : hlColor ?? (isLight ? '#F0D9B5' : '#B58863');

              return (
                <TouchableOpacity
                  key={sq}
                  onPress={() => handleTap(sq)}
                  activeOpacity={0.85}
                  style={[styles.square, { backgroundColor: bgColor }]}
                >
                  {piece && (
                    <Text style={[
                      styles.piece,
                      {
                        color:            piece[0] === 'w' ? '#fff'  : '#1a1a1a',
                        textShadowColor:  piece[0] === 'w' ? '#444'  : '#bbb',
                      },
                    ]}>
                      {UNICODE[piece] ?? ''}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  board:  { width: SIZE, height: SIZE },
  row:    { flexDirection: 'row' },
  square: { width: SQ, height: SQ, alignItems: 'center', justifyContent: 'center' },
  piece:  {
    fontSize:          SQ * 0.72,
    textShadowOffset:  { width: 0.5, height: 0.5 },
    textShadowRadius:  1,
    userSelect:        'none' as never,
  },
});
