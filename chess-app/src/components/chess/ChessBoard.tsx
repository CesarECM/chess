import { forwardRef, useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import Chessboard from 'react-native-chessboard';
import type { ChessboardRef, MoveResult } from 'react-native-chessboard';
import * as Haptics from 'expo-haptics';

import { getSideToMove, toUCI } from '@/services/chess';
import { useTheme } from '@/hooks/useTheme';

export type { ChessboardRef };
export type Orientation = 'white' | 'black' | 'auto';

interface ChessBoardProps {
  fen: string;
  /** 'auto' flips to match the side that's to move in the given FEN. */
  orientation?: Orientation;
  onMove?: (uciMove: string, newFen: string) => void;
  onIllegalMove?: (from: string, to: string) => void;
  /** Disable user interaction (e.g. while the engine is responding). */
  enabled?: boolean;
}

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  ({ fen, orientation = 'auto', onMove, onIllegalMove, enabled = true }, ref) => {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const boardSize = Math.min(width, 480);

    const flipped =
      orientation === 'black' ||
      (orientation === 'auto' && getSideToMove(fen) === 'b');

    const handleMove = useCallback(
      (result: MoveResult) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (!onMove) return;
        const uci = toUCI(result.move.from, result.move.to, result.move.promotion);
        onMove(uci, result.state.fen);
      },
      [onMove],
    );

    const handleIllegalMove = useCallback(
      (from: string, to: string) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onIllegalMove?.(from, to);
      },
      [onIllegalMove],
    );

    return (
      <Chessboard
        ref={ref}
        fen={fen}
        flipped={flipped}
        gestureEnabled={enabled}
        boardSize={boardSize}
        onMove={handleMove}
        onIllegalMove={handleIllegalMove}
        colors={{
          white: '#F0D9B5',
          black: '#B58863',
          lastMoveHighlight: 'rgba(20, 85, 30, 0.5)',
          checkmateHighlight: '#E53E3E',
          promotionPieceButton: colors.accent,
        }}
      />
    );
  },
);
