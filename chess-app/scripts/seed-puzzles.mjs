/**
 * seed-puzzles.mjs — Seeds / replenishes the `puzzles` table in Supabase.
 *
 * Modes:
 *   (default)          Generate 500 synthetic valid puzzles via chess.js
 *   --file <path>      Parse a local Lichess puzzle CSV and seed from it
 *   --check            Print the number of pending stock_alerts and exit
 *   --replenish        Import missing puzzles per band from stock_alerts
 *                      (requires --file <path>)
 *
 * Prerequisites:
 *   EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY either in
 *   .env.local (local runs) or as environment variables (CI).
 *
 * Run from chess-app/:
 *   node scripts/seed-puzzles.mjs
 *   node scripts/seed-puzzles.mjs --file ~/lichess_db_puzzle.csv
 *   node scripts/seed-puzzles.mjs --check
 *   node scripts/seed-puzzles.mjs --replenish --file ~/lichess_db_puzzle.csv
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
// Supports both local (.env.local) and CI (process.env) execution.

function loadEnvFile() {
  const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (!existsSync(envPath)) return {};
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

const envFile = loadEnvFile();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? envFile.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? envFile.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL missing from .env.local or environment');
if (!key) {
  console.error('\n⚠️  SUPABASE_SERVICE_ROLE_KEY no encontrada en .env.local ni en el entorno');
  console.error('   Agrégala desde: Supabase dashboard → Settings → API → service_role (secret)\n');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ─── THEME MAPPING ────────────────────────────────────────────────────────────

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
  if (moves.length < 2) return null;
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

  const setupMoves = 8 + Math.floor(rng() * 16);
  for (let i = 0; i < setupMoves; i++) {
    const moves = chess.moves();
    if (!moves.length || chess.isGameOver()) { chess.reset(); break; }
    chess.move(moves[Math.floor(rng() * moves.length)]);
  }
  if (chess.isGameOver()) chess.reset();

  const fen = chess.fen();
  const solHalfMoves = 2 + Math.floor(rng() * 2) * 2;
  const moveList = [];

  for (let i = 0; i < solHalfMoves; i++) {
    if (chess.isGameOver()) break;
    const verbose = chess.moves({ verbose: true });
    if (!verbose.length) break;
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
    rating:           800 + Math.floor((index / TARGET) * 1400),
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
    if (i > TARGET * 3) break;
  }
  return puzzles;
}

// ─── UPSERT ───────────────────────────────────────────────────────────────────

async function upsertBatches(supabaseClient, puzzles) {
  let done = 0;
  for (let i = 0; i < puzzles.length; i += BATCH_SIZE) {
    const batch = puzzles.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseClient
      .from('puzzles')
      .upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    done += batch.length;
    process.stdout.write(`\r  Insertando... ${done}/${puzzles.length}`);
  }
  process.stdout.write('\n');
}

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const fileIdx   = args.indexOf('--file');
const filePath  = fileIdx >= 0 ? args[fileIdx + 1] : null;
const isCheck   = args.includes('--check');
const isReplenish = args.includes('--replenish');

// ─── MODE: --check ────────────────────────────────────────────────────────────
// Prints the number of pending stock_alerts to stdout (used by GitHub Actions).

if (isCheck) {
  const { data, error } = await supabase.from('stock_alerts').select('band_min');
  if (error) { console.error(error.message); process.exit(1); }
  console.log((data ?? []).length);
  process.exit(0);
}

// ─── MODE: --replenish ────────────────────────────────────────────────────────
// Reads stock_alerts, streams the CSV, imports missing puzzles per band,
// then clears each processed alert.

if (isReplenish) {
  if (!filePath || !existsSync(filePath)) {
    console.error('--replenish requires --file <path> pointing to a valid Lichess CSV.');
    process.exit(1);
  }

  const { data: alerts, error: alertsErr } = await supabase
    .from('stock_alerts')
    .select('*');

  if (alertsErr) throw new Error(alertsErr.message);

  if (!alerts || alerts.length === 0) {
    console.log('✓ Stock OK — nothing to replenish.');
    process.exit(0);
  }

  console.log(`\n🔄 Replenishing ${alerts.length} band(s):`);
  alerts.forEach((a) => console.log(`   ${a.band_min}–${a.band_max}: need ${a.deficit} puzzles`));

  // Map: band_min → band descriptor with collected puzzles
  const bands = new Map(
    alerts.map((a) => [a.band_min, { min: a.band_min, max: a.band_max, deficit: a.deficit, puzzles: [] }]),
  );

  // Single-pass CSV scan — stops early once all bands are satisfied
  const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if ([...bands.values()].every((b) => b.puzzles.length >= b.deficit)) break;
    const p = parseCsvLine(line);
    if (!p) continue;
    const band = bands.get(
      [...bands.keys()].find((min) => {
        const b = bands.get(min);
        return p.rating >= b.min && p.rating < b.max && b.puzzles.length < b.deficit;
      }),
    );
    if (band) band.puzzles.push(p);
  }

  // Import per band, then clear alert
  for (const band of bands.values()) {
    if (band.puzzles.length > 0) {
      console.log(`\n📦 Band ${band.min}–${band.max}: importing ${band.puzzles.length} puzzles`);
      await upsertBatches(supabase, band.puzzles);
    } else {
      console.log(`\n⚠️  Band ${band.min}–${band.max}: no puzzles found in CSV for this band`);
    }
    await supabase.from('stock_alerts').delete().eq('band_min', band.min).eq('band_max', band.max);
  }

  console.log('\n✅ Replenishment complete.\n');
  process.exit(0);
}

// ─── MODE: default seed ───────────────────────────────────────────────────────

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

const { count, error: countErr } = await supabase
  .from('puzzles')
  .select('id', { count: 'exact', head: true });

if (countErr) throw countErr;
console.log(`\n✅ Seed completado. Total en DB: ${count} puzzles.\n`);
