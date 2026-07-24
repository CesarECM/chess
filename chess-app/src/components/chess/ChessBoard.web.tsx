import { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Square, PieceSymbol, Move } from 'chess.js';

// Minimal ref interface matching the native ChessboardRef — methods are no-ops on web.
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

const noop = () => undefined as never;

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  (_props, ref) => {
    // Expose a no-op ref so usePuzzleSolver calls don't throw.
    if (ref && typeof ref === 'object') {
      ref.current = {
        move:                     () => Promise.resolve(undefined),
        undo:                     () => null,
        highlight:                noop,
        resetAllHighlightedSquares: noop,
        resetBoard:               noop,
        getState:                 () => ({}),
      };
    }
    return (
      <View style={styles.board}>
        <Text style={styles.label}>Tablero disponible en app móvil</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  board: {
    width: 350,
    height: 350,
    backgroundColor: '#B58863',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  label: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
