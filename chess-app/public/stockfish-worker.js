/* global Stockfish */
importScripts('https://cdn.jsdelivr.net/npm/stockfish/src/stockfish.js');

let sf = null;
let pvs = {};

function setup(engine) {
  sf = engine;
  sf.addMessageListener(onLine);
  sf.postMessage('uci');
  sf.postMessage('isready');
}

function init() {
  const instance = Stockfish();
  if (instance && typeof instance.then === 'function') {
    instance.then(setup);
  } else {
    setup(instance);
  }
}

function onLine(line) {
  if (!line) return;

  // info depth 18 seldepth 25 multipv 1 score cp 35 nodes 123 nps 456 pv e2e4 e7e5 ...
  // info depth 18 multipv 2 score mate -3 pv ...
  const m = line.match(
    /^info.*\bdepth (\d+).*\bmultipv (\d+).*\bscore (cp|mate) (-?\d+).*\bpv ([\w\s]+)/
  );
  if (m) {
    const depth = +m[1];
    const mpv   = +m[2];
    const type  = m[3];
    const val   = +m[4];
    const moves = m[5].trim();
    pvs[mpv] = type === 'cp' ? { moves, cp: val } : { moves, mate: val };
    self.postMessage({ type: 'info', depth, mpv });
    return;
  }

  if (line.startsWith('bestmove')) {
    const move   = line.split(' ')[1];
    const result = Object.values(pvs);
    pvs = {};
    self.postMessage({ type: 'bestmove', move, pvs: result });
  }
}

self.onmessage = function (e) {
  const msg = e.data;
  if (!sf) { init(); }

  if (msg.type === 'analyze') {
    pvs = {};
    sf.postMessage('stop');
    sf.postMessage(`setoption name MultiPV value ${msg.multiPv ?? 3}`);
    sf.postMessage(`position fen ${msg.fen}`);
    sf.postMessage(`go depth ${msg.depth ?? 18}`);
  } else if (msg.type === 'stop') {
    sf.postMessage('stop');
  }
};
