// Override postMessage BEFORE importScripts so Stockfish.js's init captures our interceptor.
// This lets us parse UCI output and manage the analyze/stop state machine here in the worker,
// preventing spurious bestmove responses from leaking to the service.
const _postToMain = self.postMessage.bind(self);

let pvs = {};
let analyzing = false;
let queued = null;

function handleUCILine(line) {
  if (!line || typeof line !== 'string') return;

  if (line.startsWith('info')) {
    const dM     = line.match(/\bdepth (\d+)/);
    const mpvM   = line.match(/\bmultipv (\d+)/);
    const scoreM = line.match(/\bscore (cp|mate) (-?\d+)/);
    const pvM    = line.match(/\bpv (.+)/);
    if (dM && scoreM && pvM) {
      const mpv = mpvM ? +mpvM[1] : 1;
      pvs[mpv]  = scoreM[1] === 'cp'
        ? { moves: pvM[1].trim(), cp: +scoreM[2] }
        : { moves: pvM[1].trim(), mate: +scoreM[2] };
      _postToMain({ type: 'info', depth: +dM[1], pvs: Object.values(pvs) });
    }
    return;
  }

  if (line.startsWith('bestmove')) {
    analyzing = false;
    _postToMain({ type: 'bestmove', pvs: Object.values(pvs) });
    pvs = {};
    if (queued) {
      const task = queued;
      queued = null;
      task();
    }
  }
}

self.postMessage = handleUCILine;

importScripts('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js');

// Capture stockfish.js's UCI input handler (set during importScripts)
const _sfInput = self.onmessage;

function toEngine(cmd) {
  _sfInput.call(self, { data: cmd });
}

self.onmessage = function (e) {
  const msg = e.data;

  if (msg && msg.type === 'analyze') {
    const start = () => {
      pvs = {};
      analyzing = true;
      toEngine('setoption name MultiPV value ' + (msg.multiPv ?? 3));
      toEngine('position fen ' + msg.fen);
      toEngine('go depth ' + (msg.depth ?? 15));
    };
    if (analyzing) {
      queued = start;
      toEngine('stop'); // stockfish responds with bestmove → triggers queued start
    } else {
      start();
    }
  } else if (msg && msg.type === 'stop') {
    queued = null;
    if (analyzing) toEngine('stop');
  }
};
