import { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { Chessboard } from 'react-chessboard';
import type { Square, PieceSymbol, Move } from 'chess.js';

import { getSideToMove, applyMove } from '@/services/chess';

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

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  ({ fen, orientation = 'auto', onMove, enabled = true }, ref) => {
    const [squareStyles, setSquareStyles] = useState<Record<string, Record<string, string>>>({});

    const side = orientation === 'auto' ? getSideToMove(fen) : orientation;
    const boardOrientation = side === 'b' ? 'black' : 'white';

    useImperativeHandle(ref, () => ({
      move:  () => Promise.resolve(undefined),
      undo:  () => null,
      highlight: ({ square, color }) =>
        setSquareStyles(s => ({ ...s, [square]: { backgroundColor: color ?? 'rgba(255,255,0,0.5)' } })),
      resetAllHighlightedSquares: () => setSquareStyles({}),
      resetBoard: () => setSquareStyles({}),
      getState: () => ({}),
    }), []);

    function handleDrop(from: string, to: string): boolean {
      if (!enabled) return false;
      let uci = `${from}${to}`;
      let newFen = applyMove(fen, uci);
      if (!newFen) {
        uci = `${uci}q`; // auto-promote to queen
        newFen = applyMove(fen, uci);
      }
      if (!newFen) return false;
      onMove?.(uci, newFen);
      return true;
    }

    return (
      <View style={{ width: 350, height: 350 }}>
        <Chessboard
          position={fen}
          boardOrientation={boardOrientation}
          arePiecesDraggable={enabled}
          onPieceDrop={handleDrop}
          customSquareStyles={squareStyles as never}
          animationDuration={200}
          boardWidth={350}
        />
      </View>
    );
  },
);
