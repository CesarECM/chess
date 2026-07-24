/**
 * seed-puzzles.mjs — Seeds the `puzzles` table in Supabase.
 *
 * Modes:
 *   (default)       Generate 500 synthetic valid puzzles via chess.js
 *   --file <path>   Parse a local Lichess puzzle CSV and seed from it
 *
 * Prerequisites:
 *   SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   (Supabase dashboard → Settings → API → service_role secret key)
 *
 * Run from chess-app/:
 *   node scripts/seed-puzzles.mjs
 *   node scripts/seed-puzzles.mjs --file ~/lichess_db_puzzle.csv
 *
 * To obtain the Lichess CSV (requires zstd):
 *   curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -d > puzzles.csv
 *   node scripts/seed-puzzles.mjs --file puzzles.csv
 */

import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

const TARGET     = 500;
const BATCH_SIZE = 50;

// ─── ENV ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (!existsSync(envPath)) {
    throw new Error('.env.local not found. Run this script from the chess-app/ directory.');
  }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const eq = l.indexOf('=');
        return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

// ─── THEME MAPPING ────────────────────────────────────────────────────────────
// Lichess theme tags → our TacticType

const LICHESS_THEME_MAP = {
  mate: 'mate', mateIn1: 'mate', mateIn2: 'mate', mateIn3: 'mate',
  mateIn4: 'mate', mateIn5: 'mate',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discoveredAttack',
  deflection: 'deflection',
};

function mapThemes(lichessThemeStr) {
  const mapped = [
    ...new Set(
      (lichessThemeStr ?? '')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((t) => LICHESS_THEME_MAP[t])
        .filter(Boolean),
    ),
  ];
  return mapped.length ? mapped : ['other'];
}

// ─── LICHESS CSV PARSER ───────────────────────────────────────────────────────
// Columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags

function parseCsvLine(line) {
  if (!line || line.startsWith('PuzzleId')) return null;
  const cols = line.split(',');
  if (cols.length < 8) return null;
  const [id, fen, movesRaw, rating, ratingDev, popularity, , themesRaw, gameUrl] = cols;
  if (!id?.trim() || !fen?.trim() || !movesRaw?.trim()) return null;
  const moves = movesRaw.trim().split(' ').filter(Boolean);
  if (moves.length < 2) return null; // need at least: opponent move + one user move
  const ratingInt = parseInt(rating, 10);
  if (isNaN(ratingInt)) return null;
  return {
    id:               id.trim(),
    fen:              fen.trim(),
    moves,
    rating:           ratingInt,
    rating_deviation: parseInt(ratingDev, 10) || 0,
    popularity:       parseInt(popularity, 10) || 0,
    themes:           mapThemes(themesRaw),
    game_url:         gameUrl?.trim() || null,
  };
}

async function parseCsvFile(filePath) {
  const puzzles = [];
  const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (puzzles.length >= TARGET) break;
    const p = parseCsvLine(line);
    if (p) puzzles.push(p);
  }
  return puzzles;
}

// ─── SYNTHETIC GENERATOR ──────────────────────────────────────────────────────
// Generates valid chess positions by playing legal moves from the start position.
// Uses a deterministic LCG so the same index always yields the same puzzle.

const TACTIC_CYCLE = ['mate', 'fork', 'pin', 'skewer', 'discoveredAttack', 'deflection', 'other'];

function lcg(seed) {
  let s = ((seed + 1) * 1234567) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function generatePuzzle(index) {
  const rng  = lcg(index);
  const chess = new Chess();

  // Reach a varied position by playing random legal moves
  const setupMoves = 8 + Math.floor(rng() * 16); // 8–23 half-moves
  for (let i = 0; i < setupMoves; i++) {
    const moves = chess.moves();
    if (!moves.length || chess.isGameOver()) { chess.reset(); break; }
    chess.move(moves[Math.floor(rng() * moves.length)]);
  }
  if (chess.isGameOver()) chess.reset();

  const fen = chess.fen(); // position before the opponent's forcing move

  // Build the move sequence starting with the opponent's forcing move
  const solHalfMoves = 2 + Math.floor(rng() * 2) * 2; // 2 or 4 half-moves total
  const moveList = [];

  for (let i = 0; i < solHalfMoves; i++) {
    if (chess.isGameOver()) break;
    const verbose = chess.moves({ verbose: true });
    if (!verbose.length) break;
    // Prefer captures / checks for more puzzle-like moves
    const interesting = verbose.filter((m) => m.captured || m.san.includes('+'));
    const pool = interesting.length && i % 2 === 0 ? interesting : verbose;
    const m = pool[Math.floor(rng() * pool.length)];
    chess.move(m);
    moveList.push(`${m.from}${m.to}${m.promotion ?? ''}`);
  }

  if (moveList.length < 2) return null;

  return {
    id:               `SYNT${String(index).padStart(6, '0')}`,
    fen,
    moves:            moveList,
    rating:           800 + Math.floor((index / TARGET) * 1400), // linear 800–2200
    rating_deviation: 45 + Math.floor(rng() * 80),
    popularity:       60 + Math.floor(rng() * 40),
    themes:           [TACTIC_CYCLE[index % TACTIC_CYCLE.length]],
    game_url:         null,
  };
}

async function generatePuzzles() {
  const puzzles = [];
  for (let i = 0; puzzles.length < TARGET; i++) {
    const p = generatePuzzle(i);
    if (p) puzzles.push(p);
    if (i > TARGET * 3) break; // safety valve
  }
  return puzzles;
}

// ─── UPSERT ───────────────────────────────────────────────────────────────────

async function upsertBatches(supabase, puzzles) {
  let done = 0;
  for (let i = 0; i < puzzles.length; i += BATCH_SIZE) {
    const batch = puzzles.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('puzzles')
      .upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    done += batch.length;
    process.stdout.write(`\r  Insertando... ${done}/${puzzles.length}`);
  }
  process.stdout.write('\n');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const fileIdx  = args.indexOf('--file');
const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;

const env = loadEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL missing from .env.local');
if (!key) {
  console.error('\n⚠️  SUPABASE_SERVICE_ROLE_KEY no encontrada en .env.local');
  console.error('   Agrégala desde: Supabase dashboard → Settings → API → service_role (secret)\n');
  console.error('   Ejemplo en .env.local:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

if (filePath) {
  if (!existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);
  console.log(`\n📂 Leyendo Lichess CSV: ${filePath}`);
} else {
  console.log(`\n⚙️  Generando ${TARGET} puzzles sintéticos con chess.js...`);
}

const puzzles = filePath ? await parseCsvFile(filePath) : await generatePuzzles();

if (puzzles.length === 0) {
  console.error('✗ No se generaron puzzles. Verifica el archivo CSV.');
  process.exit(1);
}

console.log(`✓ ${puzzles.length} puzzles preparados. Distribución de ratings: ` +
  `${Math.min(...puzzles.map(p => p.rating))}–${Math.max(...puzzles.map(p => p.rating))}`);

await upsertBatches(supabase, puzzles);

const { count, error } = await supabase
  .from('puzzles')
  .select('id', { count: 'exact', head: true });

if (error) throw error;
console.log(`\n✅ Seed completado. Total en DB: ${count} puzzles.\n`);
