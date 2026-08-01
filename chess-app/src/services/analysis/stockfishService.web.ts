import type { CloudEvalResult, CloudEvalPv } from './lichessCloudEval';

let worker: Worker | null = null;
let pendingCancel: (() => void) | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker('/stockfish-worker.js');
  }
  return worker;
}

export async function analyzeWithStockfish(
  fen: string,
  depth = 15,
  multiPv = 3,
  timeoutMs = 10_000,
  onProgress?: (pvs: CloudEvalPv[], depth: number) => void,
): Promise<CloudEvalResult | null> {
  pendingCancel?.();
  pendingCancel = null;

  return new Promise((resolve) => {
    const w = getWorker();
    let settled = false;
    let latestDepth = 0;

    function finish(result: CloudEvalResult | null) {
      if (settled) return;
      settled = true;
      pendingCancel = null;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      resolve(result);
    }

    pendingCancel = () => {
      w.postMessage({ type: 'stop' });
      finish(null);
    };

    const timer = setTimeout(() => {
      w.postMessage({ type: 'stop' });
      finish(null);
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'info') {
        const d = msg.depth ?? 0;
        if (d > latestDepth) {
          latestDepth = d;
          if (onProgress && msg.pvs?.length) {
            onProgress(msg.pvs, d);
          }
        }
        return;
      }
      if (msg.type === 'bestmove') {
        const pvList: CloudEvalPv[] = msg.pvs ?? [];
        finish(pvList.length
          ? { fen, depth: latestDepth || depth, knodes: 0, pvs: pvList }
          : null);
      }
    }

    w.addEventListener('message', onMessage);
    w.postMessage({ type: 'analyze', fen, depth, multiPv });
  });
}
