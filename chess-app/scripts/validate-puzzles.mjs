/**
 * validate-puzzles.mjs — Valida todos los puzzles en Supabase.
 *
 * Para cada puzzle aplica cada movimiento de la secuencia en orden y verifica
 * que sea legal con chess.js. Reporta IDs con movimientos inválidos y los
 * elimina opcionalmente.
 *
 * Uso:
 *   node scripts/validate-puzzles.mjs            — solo reporta
 *   node scripts/validate-puzzles.mjs --delete   — reporta y elimina los inválidos
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

// ── ENV ───────────────────────────────────────────────────────────────────────

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

if (!url || !key) {
  console.error('Faltan EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const shouldDelete = process.argv.includes('--delete');

// ── VALIDACIÓN ────────────────────────────────────────────────────────────────

function parseUCI(uci) {
  return {
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    ...(uci.length === 5 && { promotion: uci[4] }),
  };
}

/**
 * Valida un puzzle. Devuelve null si es válido, o un string describiendo el error.
 *
 * Regla de Lichess: moves[0] es el movimiento del oponente (setup del puzzle),
 * moves[1], moves[3], etc. son las jugadas del usuario.
 * Todos los movimientos deben ser legales en la posición resultante acumulada.
 */
function validatePuzzle(puzzle) {
  const { id, fen, moves } = puzzle;

  if (!fen || typeof fen !== 'string') return 'FEN vacío o inválido';
  if (!Array.isArray(moves) || moves.length < 2) return `moves insuficientes (${moves?.length ?? 0})`;

  let chess;
  try {
    chess = new Chess(fen);
  } catch (e) {
    return `FEN no parseable: ${e.message}`;
  }

  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i];
    if (!uci || typeof uci !== 'string' || uci.length < 4) {
      return `moves[${i}] malformado: "${uci}"`;
    }

    let result;
    try {
      result = chess.move(parseUCI(uci));
    } catch (e) {
      return `moves[${i}] "${uci}" → excepción chess.js: ${e.message}`;
    }

    if (!result) {
      // Mueve con SAN para ver cuáles son legales
      const legal = chess.moves({ verbose: true }).map((m) => `${m.from}${m.to}`);
      return `moves[${i}] "${uci}" ilegal en FEN "${chess.fen()}" — legales: [${legal.slice(0, 6).join(', ')}${legal.length > 6 ? '…' : ''}]`;
    }
  }

  return null; // válido
}

// ── FETCH POR PÁGINAS ─────────────────────────────────────────────────────────

async function fetchAllPuzzles() {
  const PAGE = 1000;
  const puzzles = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('puzzles')
      .select('id, fen, moves, rating')
      .range(from, from + PAGE - 1)
      .order('id');

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    puzzles.push(...data);
    process.stdout.write(`\r  Fetching… ${puzzles.length} puzzles`);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  process.stdout.write('\n');
  return puzzles;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

console.log('\n🔍  Validando puzzles en Supabase…\n');

const all = await fetchAllPuzzles();
console.log(`  Total: ${all.length} puzzles\n`);

const bad = [];

for (const puzzle of all) {
  const err = validatePuzzle(puzzle);
  if (err) {
    bad.push({ id: puzzle.id, rating: puzzle.rating, error: err });
  }
}

if (bad.length === 0) {
  console.log('✅  Todos los puzzles son válidos.\n');
  process.exit(0);
}

console.log(`❌  ${bad.length} puzzle(s) inválido(s):\n`);
for (const b of bad) {
  console.log(`  [${b.id}] rating=${b.rating}`);
  console.log(`         ${b.error}\n`);
}

if (shouldDelete) {
  const ids = bad.map((b) => b.id);
  console.log(`\n🗑️  Eliminando ${ids.length} puzzle(s) inválido(s)…`);
  const { error } = await supabase.from('puzzles').delete().in('id', ids);
  if (error) {
    console.error(`  Error al eliminar: ${error.message}`);
    process.exit(1);
  }
  console.log('  ✅  Eliminados correctamente.\n');
} else {
  console.log('  ℹ️  Para eliminarlos: node scripts/validate-puzzles.mjs --delete\n');
}
