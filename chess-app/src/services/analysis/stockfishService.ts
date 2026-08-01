import type { CloudEvalResult, CloudEvalPv } from './lichessCloudEval';

export async function analyzeWithStockfish(
  _fen?: string,
  _depth?: number,
  _multiPv?: number,
  _timeoutMs?: number,
  _onProgress?: (pvs: CloudEvalPv[], depth: number) => void,
): Promise<CloudEvalResult | null> {
  return null;
}
