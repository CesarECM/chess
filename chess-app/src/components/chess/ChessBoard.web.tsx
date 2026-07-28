import { forwardRef, useImperativeHandle, useState, useCallback, useRef } from 'react';
import { Animated, Easing, Modal, View, TouchableOpacity, StyleSheet, Image, Text, useWindowDimensions } from 'react-native';
import { Chess } from 'chess.js';
import type { Square, PieceSymbol, Move } from 'chess.js';

import { applyMove, getLegalMovesFromSquare } from '@/services/chess';
import { BOARD_THEMES } from '@/constants/boardThemes';
import { getPieceUrl } from '@/constants/pieceSets';
import { useUserStore } from '@/stores/useUserStore';

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
  /** Hard cap on board size in px — used by PuzzleCard to prevent vertical overflow. */
  maxSize?: number;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PROMO_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];
const PROMO_SYMBOLS: Record<string, string> = {
  wq: '♕', wr: '♖', wb: '♗', wn: '♘',
  bq: '♛', br: '♜', bb: '♝', bn: '♞',
};

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

/** Converts chess.js color+type (e.g. 'w'+'k') to piece key (e.g. 'wK'). */
function toPieceKey(colorType: string): string {
  return colorType[0] + colorType[1].toUpperCase();
}

function squareToPos(sq: Square, flipped: boolean, sqSize: number): { x: number; y: number } {
  const fileIndex = FILES.indexOf(sq[0]);
  const rankIndex = RANKS.indexOf(sq[1]);
  return {
    x: (flipped ? 7 - fileIndex : fileIndex) * sqSize,
    y: (flipped ? 7 - rankIndex : rankIndex) * sqSize,
  };
}

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  ({ fen, orientation = 'auto', onMove, onIllegalMove, enabled = true, maxSize }, ref) => {
    const { width }    = useWindowDimensions();
    const rawSize      = Math.min(Math.floor(width), 480); // fills shell, never exceeds 480px
    const SIZE         = maxSize !== undefined ? Math.min(rawSize, maxSize) : rawSize;
    const SQ           = SIZE / 8;

    const boardThemeId = useUserStore((s) => s.boardTheme);
    const pieceSet     = useUserStore((s) => s.pieceSet);
    const theme        = BOARD_THEMES[boardThemeId];

    const currentFenRef = useRef(fen);
    const [currentFen, setCurrentFen] = useState(fen);
    const fenPropRef    = useRef(fen);
    fenPropRef.current  = fen;

    const [highlights,   setHighlights]   = useState<Record<string, string>>({});
    const [selected,     setSelected]     = useState<Square | null>(null);
    const [lastMove,     setLastMove]     = useState<{ from: Square; to: Square } | null>(null);
    const [legalDests,   setLegalDests]   = useState<ReadonlySet<string>>(new Set());

    const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);

    const [hiddenSquare, setHiddenSquare] = useState<Square | null>(null);
    const [animState, setAnimState] = useState<{
      pieceKey: string;
      anim: Animated.ValueXY;
    } | null>(null);
    const animRef = useRef<Animated.ValueXY | null>(null);

    const flipped    = orientation === 'black' ||
      (orientation === 'auto' && fen.split(' ')[1] === 'w');
    const flippedRef = useRef(flipped);
    flippedRef.current = flipped;

    const ranks = flipped ? [...RANKS].reverse() : RANKS;
    const files = flipped ? [...FILES].reverse() : FILES;

    function playMoveAnim(from: Square, to: Square, newFen: string, pieceType: string, promotion?: PieceSymbol) {
      if (animRef.current) {
        animRef.current.stopAnimation();
        animRef.current = null;
        setAnimState(null);
        setHiddenSquare(null);
        setCurrentFen(currentFenRef.current);
      }

      const rawType   = promotion ? `${pieceType[0]}${promotion}` : pieceType;
      const pieceKey  = toPieceKey(rawType);
      const fromPos   = squareToPos(from, flippedRef.current, SQ);
      const toPos     = squareToPos(to,   flippedRef.current, SQ);

      const anim = new Animated.ValueXY(fromPos);
      animRef.current = anim;
      setHiddenSquare(from);
      setAnimState({ pieceKey, anim });

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
      const pieceType  = piecesNow[selected];

      if (newFenBase) {
        currentFenRef.current = newFenBase;
        setSelected(null);
        setLegalDests(new Set());
        onMove?.(base, newFenBase);
        if (pieceType) {
          playMoveAnim(selected, sq, newFenBase, pieceType, undefined);
        } else {
          setCurrentFen(newFenBase);
          setLastMove({ from: selected, to: sq });
        }
      } else if (applyMove(fenNow, `${base}q`)) {
        // Pawn promotion — let user pick the piece
        setSelected(null);
        setLegalDests(new Set());
        setPromotionPending({ from: selected, to: sq });
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

    const handlePromotion = useCallback((piece: PieceSymbol) => {
      if (!promotionPending) return;
      const { from, to } = promotionPending;
      const uci     = `${from}${to}${piece}`;
      const newFen  = applyMove(currentFenRef.current, uci);
      const ptBefore = parseFen(currentFenRef.current)[from];
      setPromotionPending(null);
      if (newFen) {
        currentFenRef.current = newFen;
        onMove?.(uci, newFen);
        if (ptBefore) playMoveAnim(from, to, newFen, ptBefore, piece);
        else { setCurrentFen(newFen); setLastMove({ from, to }); }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promotionPending, onMove]);

    const promoColor = currentFenRef.current.split(' ')[1] as 'w' | 'b';

    return (
      <View style={{ width: SIZE, height: SIZE }}>
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
                  : (isLight ? theme.light : theme.dark));

              return (
                <TouchableOpacity
                  key={sq}
                  onPress={() => handleTap(sq)}
                  activeOpacity={0.85}
                  style={{ width: SQ, height: SQ, alignItems: 'center', justifyContent: 'center', backgroundColor: bgColor }}
                >
                  {piece && (
                    <Image
                      source={{ uri: getPieceUrl(pieceSet, toPieceKey(piece)) }}
                      style={{ width: SQ * 0.88, height: SQ * 0.88 }}
                    />
                  )}
                  {isDest && !isCapture && (
                    <View style={{
                      position: 'absolute',
                      width: SQ * 0.33, height: SQ * 0.33,
                      borderRadius: SQ * 0.165,
                      backgroundColor: 'rgba(0,0,0,0.22)',
                    }} />
                  )}
                  {isDest && isCapture && (
                    <View style={{
                      position: 'absolute',
                      width: SQ - 2, height: SQ - 2,
                      borderRadius: (SQ - 2) / 2,
                      borderWidth: SQ * 0.09,
                      borderColor: 'rgba(0,0,0,0.22)',
                      backgroundColor: 'transparent',
                    }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {animState && (
          <Animated.View
            pointerEvents="none"
            style={[{
              position: 'absolute',
              width: SQ, height: SQ,
              alignItems: 'center', justifyContent: 'center',
              zIndex: 10,
            }, animState.anim.getLayout()]}
          >
            <Image
              source={{ uri: getPieceUrl(pieceSet, animState.pieceKey) }}
              style={{ width: SQ * 0.88, height: SQ * 0.88 }}
            />
          </Animated.View>
        )}

        {promotionPending && (
          <View style={[styles.promoOverlay, { width: SIZE, height: SIZE }]}>
            <View style={styles.promoBox}>
              {PROMO_PIECES.map((p) => (
                <TouchableOpacity key={p} style={styles.promoPiece} onPress={() => handlePromotion(p)}>
                  <Text style={styles.promoSymbol}>
                    {PROMO_SYMBOLS[`${promoColor}${p}`]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row:         { flexDirection: 'row' },
  promoOverlay: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
  },
  promoBox:    {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
  },
  promoPiece:  { padding: 14, alignItems: 'center', justifyContent: 'center' },
  promoSymbol: { fontSize: 36 },
});
