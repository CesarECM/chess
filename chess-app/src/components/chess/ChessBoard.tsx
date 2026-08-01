import React, { forwardRef, useImperativeHandle, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { Animated, Easing, PanResponder, Platform, View, TouchableOpacity, StyleSheet, Image, Text, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
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

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface ChessBoardProps {
  fen: string;
  orientation?: Orientation;
  onMove?: (uciMove: string, newFen: string) => void;
  onIllegalMove?: (from: string, to: string) => void;
  enabled?: boolean;
  /** Hard cap on board size in px. */
  maxSize?: number;
  /** Pass puzzle.id to force synchronous board reset on puzzle change. */
  resetKey?: string;
  /** Overlay arrows — rendered as SVG on web, no-op on native. */
  arrows?: BoardArrow[];
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PROMO_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];
const PROMO_SYMBOLS: Record<string, string> = {
  wq: '♕', wr: '♖', wb: '♗', wn: '♘',
  bq: '♛', br: '♜', bb: '♝', bn: '♞',
};

const DRAG_THRESHOLD = 5;

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

function toPieceKey(colorType: string): string {
  return colorType[0] + colorType[1].toUpperCase();
}

function squareToPos(sq: Square, flipped: boolean, sqSize: number): { x: number; y: number } {
  const fi = FILES.indexOf(sq[0]);
  const ri = RANKS.indexOf(sq[1]);
  return {
    x: (flipped ? 7 - fi : fi) * sqSize,
    y: (flipped ? 7 - ri : ri) * sqSize,
  };
}

function posToSquare(x: number, y: number, flipped: boolean, sqSize: number): Square | null {
  const col = Math.floor(x / sqSize);
  const row = Math.floor(y / sqSize);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const fi = flipped ? 7 - col : col;
  const ri = flipped ? 7 - row : row;
  return `${FILES[fi]}${RANKS[ri]}` as Square;
}

function triggerHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const ChessBoard = forwardRef<ChessboardRef, ChessBoardProps>(
  ({ fen, orientation = 'auto', onMove, onIllegalMove, enabled = true, maxSize, resetKey, arrows }, ref) => {
    const { width } = useWindowDimensions();
    const rawSize   = Math.min(Math.floor(width), width >= 640 ? 640 : 480);
    const SIZE      = maxSize !== undefined ? Math.min(rawSize, maxSize) : rawSize;
    const SQ        = SIZE / 8;

    const boardThemeId  = useUserStore((s) => s.boardTheme);
    const pieceSet      = useUserStore((s) => s.pieceSet);
    const theme         = BOARD_THEMES[boardThemeId];
    const [hr, hg, hb]  = theme.highlight;
    const hlSelected    = `rgba(${hr},${hg},${hb},0.78)`;
    const hlLastLight   = `rgba(${hr},${hg},${hb},0.48)`;
    const hlLastDark    = `rgba(${hr},${hg},${hb},0.68)`;

    const currentFenRef  = useRef(fen);
    const [currentFen,  setCurrentFen]  = useState(fen);
    const fenPropRef     = useRef(fen);
    fenPropRef.current   = fen;

    const [highlights,       setHighlights]       = useState<Record<string, string>>({});
    const [selected,         setSelected]         = useState<Square | null>(null);
    const [lastMove,         setLastMove]         = useState<{ from: Square; to: Square } | null>(null);
    const [legalDests,       setLegalDests]       = useState<ReadonlySet<string>>(new Set());
    const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
    const [hiddenSquare,     setHiddenSquare]     = useState<Square | null>(null);
    const [animState, setAnimState]               = useState<{ pieceKey: string; anim: Animated.ValueXY } | null>(null);
    const [dragPieceKey, setDragPieceKey]         = useState<string | null>(null);

    const animRef       = useRef<Animated.ValueXY | null>(null);
    const dragPos       = useRef(new Animated.ValueXY()).current;
    const pressedSqRef  = useRef<Square | null>(null);
    const dragFromRef   = useRef<Square | null>(null);

    // Refs kept current so PanResponder callbacks (created once) always see fresh values.
    const SQRef        = useRef(SQ);       SQRef.current       = SQ;
    const enabledRef   = useRef(enabled);  enabledRef.current  = enabled;
    const onMoveRef    = useRef(onMove);   onMoveRef.current   = onMove;
    const flipped      = orientation === 'black' || (orientation === 'auto' && fen.split(' ')[1] === 'w');
    const flippedRef   = useRef(flipped);  flippedRef.current  = flipped;

    useLayoutEffect(() => {
      if (!resetKey) return;
      if (animRef.current) { animRef.current.stopAnimation(); animRef.current = null; }
      currentFenRef.current = fen;
      setCurrentFen(fen);
      setHighlights({});
      setLastMove(null);
      setSelected(null);
      setLegalDests(new Set());
      setHiddenSquare(null);
      setAnimState(null);
      setDragPieceKey(null);
      dragFromRef.current  = null;
      pressedSqRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

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
      const rawType  = promotion ? `${pieceType[0]}${promotion}` : pieceType;
      const pieceKey = toPieceKey(rawType);
      const fromPos  = squareToPos(from, flippedRef.current, SQ);
      const toPos    = squareToPos(to,   flippedRef.current, SQ);
      const anim     = new Animated.ValueXY(fromPos);
      animRef.current = anim;
      setHiddenSquare(from);
      setAnimState({ pieceKey, anim });
      Animated.timing(anim, {
        toValue: toPos, duration: 160, useNativeDriver: false, easing: Easing.out(Easing.quad),
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
          if (pieceType) playMoveAnim(from, to, newFen, pieceType, promotion);
          else { setCurrentFen(newFen); setLastMove({ from, to }); }
        }
        return Promise.resolve(undefined);
      },
      undo: () => null,
      highlight: ({ square, color }) =>
        setHighlights(h => ({ ...h, [square]: color ?? 'rgba(255,255,0,0.5)' })),
      resetAllHighlightedSquares: () => setHighlights({}),
      resetBoard: (newFen) => {
        if (animRef.current) { animRef.current.stopAnimation(); animRef.current = null; }
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
        triggerHaptic();
        if (pieceType) playMoveAnim(selected, sq, newFenBase, pieceType);
        else { setCurrentFen(newFenBase); setLastMove({ from: selected, to: sq }); }
      } else if (applyMove(fenNow, `${base}q`)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, selected, onMove, onIllegalMove]);

    // Kept as a ref so PanResponder release (created once) always calls the current closure.
    const handleDropRef = useRef<(from: Square, to: Square) => void>(() => {});
    handleDropRef.current = (from: Square, to: Square) => {
      const fenNow    = currentFenRef.current;
      const piecesNow = parseFen(fenNow);
      const pieceType = piecesNow[from];
      const base      = `${from}${to}`;
      const newFen    = applyMove(fenNow, base);

      if (newFen) {
        currentFenRef.current = newFen;
        setSelected(null);
        setLegalDests(new Set());
        onMoveRef.current?.(base, newFen);
        triggerHaptic();
        if (pieceType) playMoveAnim(from, to, newFen, pieceType);
        else { setCurrentFen(newFen); setLastMove({ from, to }); }
      } else if (applyMove(fenNow, `${base}q`)) {
        setSelected(null);
        setLegalDests(new Set());
        setPromotionPending({ from, to });
      }
    };

    const panResponder = useRef(
      PanResponder.create({
        // Capture only when a square is pressed AND finger has moved beyond threshold.
        // This lets TouchableOpacity handle taps normally; drag only activates on movement.
        onMoveShouldSetPanResponder: (_, gs) =>
          enabledRef.current &&
          pressedSqRef.current !== null &&
          (Math.abs(gs.dx) > DRAG_THRESHOLD || Math.abs(gs.dy) > DRAG_THRESHOLD),

        onPanResponderGrant: (e) => {
          const fromSq = pressedSqRef.current;
          if (!fromSq) return;
          const piecesNow  = parseFen(currentFenRef.current);
          const sideToMove = currentFenRef.current.split(' ')[1];
          const pieceType  = piecesNow[fromSq];
          if (!pieceType || pieceType[0] !== sideToMove) {
            pressedSqRef.current = null;
            return;
          }
          // Stop any in-progress move animation before starting drag.
          if (animRef.current) {
            animRef.current.stopAnimation();
            animRef.current = null;
            setAnimState(null);
          }
          dragFromRef.current = fromSq;
          setDragPieceKey(toPieceKey(pieceType));
          setHiddenSquare(fromSq);
          setSelected(null);
          setLegalDests(new Set());
          const x = e.nativeEvent.locationX;
          const y = e.nativeEvent.locationY;
          dragPos.setValue({ x: x - SQRef.current / 2, y: y - SQRef.current / 2 });
        },

        onPanResponderMove: (e) => {
          if (!dragFromRef.current) return;
          dragPos.setValue({
            x: e.nativeEvent.locationX - SQRef.current / 2,
            y: e.nativeEvent.locationY - SQRef.current / 2,
          });
        },

        onPanResponderRelease: (e) => {
          const fromSq = dragFromRef.current;
          dragFromRef.current  = null;
          pressedSqRef.current = null;
          setDragPieceKey(null);
          setHiddenSquare(null);
          if (!fromSq) return;
          const destSq = posToSquare(
            e.nativeEvent.locationX,
            e.nativeEvent.locationY,
            flippedRef.current,
            SQRef.current,
          );
          if (destSq && destSq !== fromSq) handleDropRef.current(fromSq, destSq);
        },

        onPanResponderTerminate: () => {
          dragFromRef.current  = null;
          pressedSqRef.current = null;
          setDragPieceKey(null);
          setHiddenSquare(null);
        },
      }),
    ).current;

    const handlePromotion = useCallback((piece: PieceSymbol) => {
      if (!promotionPending) return;
      const { from, to } = promotionPending;
      const uci      = `${from}${to}${piece}`;
      const newFen   = applyMove(currentFenRef.current, uci);
      const ptBefore = parseFen(currentFenRef.current)[from];
      setPromotionPending(null);
      if (newFen) {
        currentFenRef.current = newFen;
        onMove?.(uci, newFen);
        triggerHaptic();
        if (ptBefore) playMoveAnim(from, to, newFen, ptBefore, piece);
        else { setCurrentFen(newFen); setLastMove({ from, to }); }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promotionPending, onMove]);

    const promoColor = currentFenRef.current.split(' ')[1] as 'w' | 'b';

    return (
      <View style={{ width: SIZE, height: SIZE }} {...panResponder.panHandlers}>
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
                ? hlSelected
                : hlColor ?? (isLastMove
                  ? (isLight ? hlLastLight : hlLastDark)
                  : (isLight ? theme.light : theme.dark));

              return (
                <TouchableOpacity
                  key={sq}
                  onPressIn={() => { pressedSqRef.current = sq; }}
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

        {/* Piece move animation overlay */}
        {animState && (
          <Animated.View
            pointerEvents="none"
            style={[{
              position: 'absolute', width: SQ, height: SQ,
              alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }, animState.anim.getLayout()]}
          >
            <Image
              source={{ uri: getPieceUrl(pieceSet, animState.pieceKey) }}
              style={{ width: SQ * 0.88, height: SQ * 0.88 }}
            />
          </Animated.View>
        )}

        {/* Drag overlay — follows finger */}
        {dragPieceKey && (
          <Animated.View
            pointerEvents="none"
            style={[{
              position: 'absolute', width: SQ, height: SQ,
              alignItems: 'center', justifyContent: 'center',
              zIndex: 15,
              transform: [{ scale: 1.15 }],
            }, dragPos.getLayout()]}
          >
            <Image
              source={{ uri: getPieceUrl(pieceSet, dragPieceKey) }}
              style={{ width: SQ * 0.88, height: SQ * 0.88 }}
            />
          </Animated.View>
        )}

        {/* Arrow overlay — web only (SVG) */}
        {Platform.OS === 'web' && arrows && arrows.length > 0 && React.createElement(
          'svg',
          { style: { position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, pointerEvents: 'none', zIndex: 5 } },
          React.createElement('defs', null,
            ...arrows.map((_, i) => {
              const color = arrows[i].color ?? 'rgba(50,200,50,0.85)';
              return React.createElement('marker', {
                key: i, id: `arrowhead-${i}`,
                markerUnits: 'userSpaceOnUse',
                markerWidth: SQ * 0.45, markerHeight: SQ * 0.45,
                refX: SQ * 0.45, refY: SQ * 0.225,
                orient: 'auto',
              }, React.createElement('polygon', {
                points: `0 0, ${SQ * 0.45} ${SQ * 0.225}, 0 ${SQ * 0.45}`, fill: color,
              }));
            }),
          ),
          ...arrows.map((arrow, i) => {
            if (!FILES.includes(arrow.from[0]) || !RANKS.includes(arrow.from[1])) return null;
            if (!FILES.includes(arrow.to[0])   || !RANKS.includes(arrow.to[1]))   return null;
            const fp  = squareToPos(arrow.from as Square, flipped, SQ);
            const tp  = squareToPos(arrow.to   as Square, flipped, SQ);
            const fx  = fp.x + SQ / 2, fy = fp.y + SQ / 2;
            const tx  = tp.x + SQ / 2, ty = tp.y + SQ / 2;
            const dx  = tx - fx, dy = ty - fy;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return null;
            const color = arrow.color ?? 'rgba(50,200,50,0.85)';
            return React.createElement('line', {
              key: i,
              x1: fx + (dx / len) * SQ * 0.3, y1: fy + (dy / len) * SQ * 0.3,
              x2: tx, y2: ty,
              stroke: color, strokeWidth: SQ * 0.12, strokeLinecap: 'round',
              markerEnd: `url(#arrowhead-${i})`,
            });
          }),
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
  row:          { flexDirection: 'row' },
  promoOverlay: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  promoBox:    { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8 },
  promoPiece:  { padding: 14, alignItems: 'center', justifyContent: 'center' },
  promoSymbol: { fontSize: 36 },
});
