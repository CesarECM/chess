export type CloudEvalPv = { moves: string; cp?: number; mate?: number };
export type CloudEvalResult = {
  fen: string;
  depth: number;
  knodes: number;
  pvs: CloudEvalPv[];
};

const cache = new Map<string, CloudEvalResult>();
const CACHE_MAX = 20;

function promoteInCache(fen: string, result: CloudEvalResult) {
  cache.delete(fen);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(fen, result);
}

export async function fetchCloudEval(fen: string, signal?: AbortSignal): Promise<CloudEvalResult | null> {
  const cached = cache.get(fen);
  if (cached) {
    promoteInCache(fen, cached);
    return cached;
  }

  const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=3`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data: CloudEvalResult = await res.json();
    promoteInCache(fen, data);
    return data;
  } catch {
    return null;
  }
}
