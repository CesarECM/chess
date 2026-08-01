import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { fetchCloudEval } from './lichessCloudEval';
import { analyzeWithStockfish } from './stockfishService';

export type EvalPoint = { cp: number | null; mate: number | null };

function normalizeEval(cp: number | undefined, mate: number | undefined, fen: string): EvalPoint {
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1;
  return {
    cp:   cp   !== undefined ? cp   * sign : null,
    mate: mate !== undefined ? mate * sign : null,
  };
}

/**
 * Analyzes an array of FENs sequentially (Lichess → Stockfish fallback on web).
 * Updates results incrementally as each position is evaluated.
 * Aborts automatically when `fens` changes or `enabled` becomes false.
 */
export function useBatchEval(fens: string[], enabled: boolean) {
  const [evals, setEvals] = useState<Array<EvalPoint | null>>([]);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  useEffect(() => {
    if (!enabled || fens.length === 0) {
      setEvals([]);
      setLoading(false);
      return;
    }

    const gen = ++genRef.current;
    const results: Array<EvalPoint | null> = new Array(fens.length).fill(null);
    setEvals([...results]);
    setLoading(true);

    (async () => {
      for (let i = 0; i < fens.length; i++) {
        if (gen !== genRef.current) return;

        const fen = fens[i];
        const lichess = await fetchCloudEval(fen);
        if (gen !== genRef.current) return;

        if (lichess && lichess.pvs.length > 0) {
          const pv = lichess.pvs[0];
          results[i] = normalizeEval(pv.cp, pv.mate, fen);
        } else if (Platform.OS === 'web') {
          const sf = await analyzeWithStockfish(fen, 12, 1, 2500);
          if (gen !== genRef.current) return;
          if (sf && sf.pvs.length > 0) {
            const pv = sf.pvs[0];
            results[i] = normalizeEval(pv.cp, pv.mate, fen);
          }
        }

        setEvals([...results]);
      }

      if (gen === genRef.current) setLoading(false);
    })();

    return () => { genRef.current++; };
  }, [fens, enabled]);

  return { evals, loading };
}
