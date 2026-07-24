import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://fvcmkgnqhqbmxicdywwe.supabase.co',
  'sb_publishable_BcRj5V587fpqhSYFdAnCiw_Xm2Kf9lL'
);

const { count, error } = await supabase
  .from('puzzles')
  .select('id', { count: 'exact', head: true });

if (error) {
  console.error('Error de conexion:', error.message);
  process.exit(1);
}

console.log(`Supabase conectado correctamente.`);
console.log(`Tabla "puzzles" accesible. Rows: ${count ?? 0}`);
