import { useState, useRef, useCallback } from 'react';
import { fetchCloudEval } from './lichessCloudEval';
import type { CloudEvalResult } from './lichessCloudEval';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: CloudEvalResult }
  | { status: 'error' };

export type { CloudEvalResult };

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (fen: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading' });
    const result = await fetchCloudEval(fen, ctrl.signal);
    if (ctrl.signal.aborted) return;
    setState(result ? { status: 'ready', result } : { status: 'error' });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, analyze, reset };
}
