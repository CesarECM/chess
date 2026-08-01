import type { CloudEvalResult } from './lichessCloudEval';

let worker: Worker | null = null;
let pendingCancel: (() => void) | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker('/stockfish-worker.js');
    worker.postMessage('uci');
  }
  return worker;
}

export async function analyzeWithStockfish(
  fen: string,
  depth = 18,
  multiPv = 3,
  timeoutMs = 10_000,
): Promise<CloudEvalResult | null> {
  pendingCancel?.();
  pendingCancel = null;

  return new Promise((resolve) => {
    const w = getWorker();
    let settled = false;
    let latestDepth = 0;
    const pvs: Record<number, { cp?: number; mate?: number; moves: string }> = {};

    function finish(result: CloudEvalResult | null) {
      if (settled) return;
      settled = true;
      pendingCancel = null;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      resolve(result);
    }

    pendingCancel = () => {
      w.postMessage('stop');
      finish(null);
    };

    const timer = setTimeout(() => {
      w.postMessage('stop');
      finish(null);
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      const line: string = typeof e.data === 'string' ? e.data : '';
      if (!line) return;

      if (line.startsWith('info')) {
        const depthM = line.match(/\bdepth (\d+)/);
        const mpvM   = line.match(/\bmultipv (\d+)/);
        const scoreM = line.match(/\bscore (cp|mate) (-?\d+)/);
        const pvM    = line.match(/\bpv (\S+(?:\s+\S+)*)/);
        if (depthM && scoreM && pvM) {
          const d   = +depthM[1];
          const mpv = mpvM ? +mpvM[1] : 1;
          const moves = pvM[1].trim();
          pvs[mpv] = scoreM[1] === 'cp'
            ? { moves, cp: +scoreM[2] }
            : { moves, mate: +scoreM[2] };
          latestDepth = Math.max(latestDepth, d);
        }
        return;
      }

      if (line.startsWith('bestmove')) {
        const pvList = Object.values(pvs);
        finish(pvList.length
          ? { fen, depth: latestDepth || depth, knodes: 0, pvs: pvList }
          : null);
      }
    }

    w.addEventListener('message', onMessage);
    // stop any previous search, then start new one
    w.postMessage('stop');
    w.postMessage(`setoption name MultiPV value ${multiPv}`);
    w.postMessage(`position fen ${fen}`);
    w.postMessage(`go depth ${depth}`);
  });
}
