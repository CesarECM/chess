import { Chess } from 'chess.js';
import type { Square, PieceSymbol } from 'chess.js';

function parseUCI(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined,
  };
}

export function toUCI(from: string, to: string, promotion?: string): string {
  return from + to + (promotion ?? '');
}

/** All legal moves in the position as UCI strings (e.g. "e2e4", "e7e8q"). */
export function getLegalMoves(fen: string): string[] {
  return new Chess(fen).moves({ verbose: true }).map((m) => toUCI(m.from, m.to, m.promotion));
}

/** Legal moves for a specific square as UCI strings. */
export function getLegalMovesFromSquare(fen: string, square: string): string[] {
  return new Chess(fen)
    .moves({ square: square as Square, verbose: true })
    .map((m) => toUCI(m.from, m.to, m.promotion));
}

/**
 * Apply a UCI move to a position.
 * Returns the resulting FEN, or null if the move is illegal.
 */
export function applyMove(fen: string, uciMove: string): string | null {
  try {
    const chess = new Chess(fen);
    const result = chess.move(parseUCI(uciMove));
    return result ? chess.fen() : null;
  } catch {
    return null;
  }
}

/** Returns true if the UCI move is legal in the given position. */
export function isLegalMove(fen: string, uciMove: string): boolean {
  return applyMove(fen, uciMove) !== null;
}

/** Which side is to move: 'w' | 'b'. */
export function getSideToMove(fen: string): 'w' | 'b' {
  return new Chess(fen).turn();
}

/** True if the position is checkmate, stalemate, or draw. */
export function isGameOver(fen: string): boolean {
  return new Chess(fen).isGameOver();
}

/** True if the FEN string is syntactically and legally valid. */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-compute FENs and SAN notations for a sequence of UCI moves from a starting position.
 * Single Chess instance — avoids redundant re-parsing.
 * Returns partial results if a move is illegal.
 */
export function computeMoveSequence(
  startFen: string,
  uciMoves: string[],
): { fens: string[]; sans: string[] } {
  const fens: string[] = [startFen];
  const sans: string[] = [];
  try {
    const chess = new Chess(startFen);
    for (const uci of uciMoves) {
      const result = chess.move({
        from:      uci.slice(0, 2) as Square,
        to:        uci.slice(2, 4) as Square,
        promotion: uci.length === 5 ? (uci[4] as PieceSymbol) : undefined,
      });
      if (!result) break;
      sans.push(result.san);
      fens.push(chess.fen());
    }
  } catch {
    // return partial result
  }
  return { fens, sans };
}
