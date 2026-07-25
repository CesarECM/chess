import { forwardRef, useImperativeHandle, useState, useCallback, useRef } from 'react';
import { Animated, Easing, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Chess } from 'chess.js';
import type { Square, PieceSymbol, Move } from 'chess.js';

import { applyMove, getLegalMovesFromSquare } from '@/services/chess';

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

/** Pixel top-left corner of a square on the board. */
function squareToPos(sq: Square, flipped: boolean): { x: number; y: number } {
  const fileIndex = FILES.indexOf(sq[0]);        // 0 = a … 7 = h
  const rankIndex = RANKS.indexOf(sq[1]);        // 0 = rank 8 (top) … 7 = rank 1 (bottom)
  return {
    x: (flipped ? 7 - fileIndex : fileIndex) * SQ,
    y: (flipped ? 7 - rankIndex : rankIndex) * SQ,
  };
}

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  ({ fen, orientation = 'auto', onMove, onIllegalMove, enabled = true }, ref) => {
    // ── Internal position state ───────────────────────────────────────────────
    const currentFenRef = useRef(fen);
    const [currentFen, setCurrentFen] = useState(fen);
    const fenPropRef    = useRef(fen);
    fenPropRef.current  = fen;

    // ── Visual state ─────────────────────────────────────────────────────────
    const [highlights,   setHighlights]   = useState<Record<string, string>>({});
    const [selected,     setSelected]     = useState<Square | null>(null);
    const [lastMove,     setLastMove]     = useState<{ from: Square; to: Square } | null>(null);
    const [legalDests,   setLegalDests]   = useState<ReadonlySet<string>>(new Set());

    // ── Animation state ───────────────────────────────────────────────────────
    const [hiddenSquare, setHiddenSquare] = useState<Square | null>(null);
    const [animState, setAnimState] = useState<{
      type: string;
      anim: Animated.ValueXY;
    } | null>(null);
    const animRef = useRef<Animated.ValueXY | null>(null);

    // ── Orientation ───────────────────────────────────────────────────────────
    // fen.split(' ')[1] is the OPPONENT's color (they play moves[0]).
    // Flip when opponent is white → player is black → black at bottom.
    const flipped    = orientation === 'black' ||
      (orientation === 'auto' && fen.split(' ')[1] === 'w');
    const flippedRef = useRef(flipped);
    flippedRef.current = flipped;

    const ranks = flipped ? [...RANKS].reverse() : RANKS;
    const files = flipped ? [...FILES].reverse() : FILES;

    // ── Animation helper ──────────────────────────────────────────────────────
    // All values accessed at call-time via refs/stable setters → safe to capture
    // in useImperativeHandle's [] closure.
    function playMoveAnim(
      from: Square,
      to: Square,
      newFen: string,
      pieceType: string,
      promotion?: PieceSymbol,
    ) {
      // Cancel any in-progress animation and snap previous state
      if (animRef.current) {
        animRef.current.stopAnimation();
        animRef.current = null;
        setAnimState(null);
        setHiddenSquare(null);
        setCurrentFen(currentFenRef.current);
      }

      const displayType = promotion ? `${pieceType[0]}${promotion}` : pieceType;
      const fromPos     = squareToPos(from, flippedRef.current);
      const toPos       = squareToPos(to,   flippedRef.current);

      const anim = new Animated.ValueXY(fromPos);
      animRef.current = anim;
      setHiddenSquare(from);
      setAnimState({ type: displayType, anim });

      Animated.timing(anim, {
        toValue:         toPos,
        duration:        160,
        useNativeDriver: false,
        easing:          Easing.out(Easing.quad),
      }).start(() => {
        animRef.current = null;
        setAnimState(null);
        setHiddenSquare(null);
        setCurrentFen(newFen);
        setLastMove({ from, to });
      });
    }

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      move: ({ from, to, promotion }) => {
        const uci       = `${from}${to}${promotion ?? ''}`;
        const pieceType = parseFen(currentFenRef.current)[from];
        const newFen    = applyMove(currentFenRef.current, uci);
        if (newFen) {
          currentFenRef.current = newFen;
          if (pieceType) {
            playMoveAnim(from, to, newFen, pieceType, promotion);
          } else {
            setCurrentFen(newFen);
            setLastMove({ from, to });
          }
        }
        return Promise.resolve(undefined);
      },
      undo: () => null,
      highlight: ({ square, color }) =>
        setHighlights(h => ({ ...h, [square]: color ?? 'rgba(255,255,0,0.5)' })),
      resetAllHighlightedSquares: () => setHighlights({}),
      resetBoard: (newFen) => {
        if (animRef.current) {
          animRef.current.stopAnimation();
          animRef.current = null;
        }
        const f = newFen ?? fenPropRef.current;
        currentFenRef.current = f;
        setCurrentFen(f);
        setHighlights({});
        setLastMove(null);
        setSelected(null);
        setLegalDests(new Set());
        setHiddenSquare(null);
        setAnimState(null);
      },
      getState: () => ({}),
    }), []);

    // ── User interaction ──────────────────────────────────────────────────────
    const pieces = parseFen(currentFen);

    const handleTap = useCallback((sq: Square) => {
      if (!enabled) return;

      const fenNow    = currentFenRef.current;
      const piecesNow = parseFen(fenNow);

      if (!selected) {
        const sideToMove = fenNow.split(' ')[1];
        if (piecesNow[sq] && piecesNow[sq][0] === sideToMove) {
          setSelected(sq);
          const dests = getLegalMovesFromSquare(fenNow, sq).map(uci => uci.slice(2, 4));
          setLegalDests(new Set(dests));
        }
        return;
      }

      if (selected === sq) { setSelected(null); setLegalDests(new Set()); return; }

      const base       = `${selected}${sq}`;
      const newFenBase = applyMove(fenNow, base);
      const newFen     = newFenBase ?? applyMove(fenNow, `${base}q`);
      const uci        = newFenBase ? base : `${base}q`;
      const promotion  = newFenBase ? undefined : 'q' as PieceSymbol;
      const pieceType  = piecesNow[selected];

      if (newFen) {
        currentFenRef.current = newFen;
        setSelected(null);
        setLegalDests(new Set());
        onMove?.(uci, newFen);
        if (pieceType) {
          playMoveAnim(selected, sq, newFen, pieceType, promotion);
        } else {
          setCurrentFen(newFen);
          setLastMove({ from: selected, to: sq });
        }
      } else {
        onIllegalMove?.(selected, sq);
        const sideToMove = fenNow.split(' ')[1];
        if (piecesNow[sq] && piecesNow[sq][0] === sideToMove) {
          setSelected(sq);
          const dests = getLegalMovesFromSquare(fenNow, sq).map(u => u.slice(2, 4));
          setLegalDests(new Set(dests));
        } else {
          setSelected(null);
          setLegalDests(new Set());
        }
      }
    }, [enabled, selected, onMove, onIllegalMove]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <View style={styles.board}>
        {ranks.map((rank, ri) => (
          <View key={rank} style={styles.row}>
            {files.map((file, fi) => {
              const sq         = `${file}${rank}` as Square;
              const isLight    = (ri + fi) % 2 === 0;
              const piece      = sq === hiddenSquare ? undefined : pieces[sq];
              const isSelected = selected === sq;
              const hlColor    = highlights[sq];
              const isLastMove = lastMove !== null && (sq === lastMove.from || sq === lastMove.to);
              const isDest     = legalDests.has(sq);
              const isCapture  = isDest && !!pieces[sq];

              const bgColor = isSelected
                ? 'rgba(20,85,30,0.75)'
                : hlColor ?? (isLastMove
                  ? (isLight ? 'rgba(20,85,30,0.45)' : 'rgba(20,85,30,0.65)')
                  : (isLight ? '#F0D9B5' : '#B58863'));

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
                        color:           piece[0] === 'w' ? '#fff' : '#1a1a1a',
                        textShadowColor: piece[0] === 'w' ? '#444' : '#bbb',
                      },
                    ]}>
                      {UNICODE[piece] ?? ''}
                    </Text>
                  )}
                  {isDest && !isCapture && <View style={styles.dot} />}
                  {isDest && isCapture  && <View style={styles.captureRing} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Animated piece overlay — absolutely positioned over the board grid */}
        {animState && (
          <Animated.View
            pointerEvents="none"
            style={[styles.animPiece, animState.anim.getLayout()]}
          >
            <Text style={[
              styles.piece,
              {
                color:           animState.type[0] === 'w' ? '#fff' : '#1a1a1a',
                textShadowColor: animState.type[0] === 'w' ? '#444' : '#bbb',
              },
            ]}>
              {UNICODE[animState.type] ?? ''}
            </Text>
          </Animated.View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  board:  { width: SIZE, height: SIZE },
  row:    { flexDirection: 'row' },
  square: { width: SQ, height: SQ, alignItems: 'center', justifyContent: 'center' },
  piece:  {
    fontSize:         SQ * 0.72,
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
    userSelect:       'none' as never,
  },
  dot: {
    position:        'absolute',
    width:           SQ * 0.33,
    height:          SQ * 0.33,
    borderRadius:    SQ * 0.165,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  captureRing: {
    position:        'absolute',
    width:           SQ - 2,
    height:          SQ - 2,
    borderRadius:    (SQ - 2) / 2,
    borderWidth:     SQ * 0.09,
    borderColor:     'rgba(0, 0, 0, 0.22)',
    backgroundColor: 'transparent',
  },
  animPiece: {
    position:       'absolute',
    width:          SQ,
    height:         SQ,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         10,
  },
});
