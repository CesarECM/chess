import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { fetchCloudEval } from './lichessCloudEval';
import { analyzeWithStockfish } from './stockfishService';
import type { CloudEvalResult } from './lichessCloudEval';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: CloudEvalResult }
  | { status: 'error' };

export type { CloudEvalResult };

// Both Lichess and Stockfish report scores from the side-to-move perspective.
// Negate when it's black's turn so cp > 0 always means white is better.
function normalizeResult(result: CloudEvalResult, fen: string): CloudEvalResult {
  const stm = fen.split(' ')[1];
  if (stm !== 'b') return result;
  return {
    ...result,
    pvs: result.pvs.map((pv) => ({
      moves: pv.moves,
      ...(pv.cp   !== undefined ? { cp:   -pv.cp   } : {}),
      ...(pv.mate !== undefined ? { mate: -pv.mate } : {}),
    })),
  };
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (fen: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading' });

    const lichess = await fetchCloudEval(fen, ctrl.signal);
    if (ctrl.signal.aborted) return;

    if (lichess) {
      setState({ status: 'ready', result: normalizeResult(lichess, fen) });
      return;
    }

    if (Platform.OS === 'web') {
      const sf = await analyzeWithStockfish(fen);
      if (ctrl.signal.aborted) return;
      setState(sf ? { status: 'ready', result: normalizeResult(sf, fen) } : { status: 'error' });
      return;
    }

    setState({ status: 'error' });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, analyze, reset };
}
