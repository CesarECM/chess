-- ============================================================
-- S14.4: RLS de producción — ejecutar en Supabase SQL Editor
-- Aplica políticas de seguridad a las tablas sin RLS y refuerza
-- las existentes. Idempotente (IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- ── 1. user_puzzle_progress ────────────────────────────────
-- No tenía RLS en migrate-fsrs.sql. Se agrega aquí.

ALTER TABLE user_puzzle_progress ENABLE ROW LEVEL SECURITY;

-- user_id es uuid — comparar directamente con auth.uid() (sin cast a text)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_puzzle_progress' AND policyname = 'Users read own progress'
  ) THEN
    CREATE POLICY "Users read own progress"
      ON user_puzzle_progress FOR SELECT
      USING (auth.uid() = user_id::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_puzzle_progress' AND policyname = 'Users upsert own progress'
  ) THEN
    CREATE POLICY "Users upsert own progress"
      ON user_puzzle_progress FOR INSERT
      WITH CHECK (auth.uid() = user_id::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_puzzle_progress' AND policyname = 'Users update own progress'
  ) THEN
    CREATE POLICY "Users update own progress"
      ON user_puzzle_progress FOR UPDATE
      USING (auth.uid() = user_id::uuid);
  END IF;
END $$;

-- ── 2. puzzle_virality ─────────────────────────────────────
-- Datos agregados: todos los usuarios autenticados pueden leer.
-- Solo el service role (via RPC increment_virality) puede escribir.

ALTER TABLE puzzle_virality ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'puzzle_virality' AND policyname = 'Authenticated users read virality'
  ) THEN
    CREATE POLICY "Authenticated users read virality"
      ON puzzle_virality FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- La función increment_virality usa SECURITY DEFINER, bypassa RLS para escritura.
-- No se necesita política de INSERT/UPDATE para usuarios normales.

-- ── 3. referrals — política INSERT faltante ────────────────
-- migrate-referrals.sql solo creó SELECT. Falta INSERT.
-- register_referral() es SECURITY DEFINER, así que no requiere política,
-- pero documentamos que INSERT directo está bloqueado (intencional).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referrals' AND policyname = 'Block direct referral insert'
  ) THEN
    CREATE POLICY "Block direct referral insert"
      ON referrals FOR INSERT
      WITH CHECK (false);
      -- Todos los inserts van via RPC register_referral (SECURITY DEFINER)
  END IF;
END $$;

-- ── 4. puzzles — lectura pública, escritura solo service role ──
-- La tabla puzzles fue poblada por seed-puzzles.mjs con service role.
-- Los usuarios solo necesitan leer.

ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'puzzles' AND policyname = 'Public read puzzles'
  ) THEN
    CREATE POLICY "Public read puzzles"
      ON puzzles FOR SELECT
      USING (true);
  END IF;
END $$;

-- ── 5. profiles — verificar políticas base de Supabase ────────
-- Supabase crea 'profiles' con RLS habilitado por defecto.
-- Aseguramos que cada usuario solo pueda leer y actualizar su propio perfil.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users read own profile'
  ) THEN
    CREATE POLICY "Users read own profile"
      ON profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users update own profile'
  ) THEN
    CREATE POLICY "Users update own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ── 6. Verificación final ──────────────────────────────────
-- Ejecuta esto para confirmar que todas las tablas tienen RLS habilitado:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- Todas las filas deben mostrar rowsecurity = true.
