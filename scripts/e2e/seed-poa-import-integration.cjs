// Siembra (o limpia con --cleanup) un board/poa con las 9 zonas reales del
// Excel del POA representadas como groups reales (mismos nombres exactos),
// SIN ningún mapeo resuelto todavía — para el Commit 3: probar que resolver
// una zona en /poa/[poaId]/zone-mappings y reimportar el MISMO archivo en
// /poa/[poaId]/import refleja el cambio (esa zona ya no aparece en
// unresolvedZones), sin perder el archivo seleccionado.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { createClient } = req('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const seedPath = path.join(os.tmpdir(), 'mantenix-e2e-poa-import-integration-seed.json');

// Mismos 9 nombres reales verificados en toda la sesión — usarlos tal cual
// permite que el <select> de zone-mappings ofrezca un match natural.
const REAL_ZONE_NAMES = [
  'PLAZA DE PTO COLOMBIA', 'PLAYA MANGLARES', 'SALGAR PLAYAS DEL COUNTRY 1',
  'SALGAR PLAYAS DE SABANAILLA 2', 'PLAYAS DE MIRAMAR SECTOR EL FARO',
  'CENTRO GASTRONOMICO', 'MERCADO LA SAZÓN', 'SENDERO SANTA VERÓNICA',
  'PLAYA PUNTA ASTILLEROS',
];

(async () => {
  if (process.argv.includes('--cleanup')) {
    if (fs.existsSync(seedPath)) {
      const { boardId } = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      const { error } = await admin.from('boards').delete().eq('id', boardId);
      console.log(error ? 'cleanup error: ' + error.message : 'Board/poa/groups de prueba eliminados');
      fs.unlinkSync(seedPath);
    } else console.log('Sin seed que limpiar');
    return;
  }

  const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
  const anonForLookup = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await anonForLookup.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.user) { console.error('Usuario E2E no existe o credenciales inválidas:', signInErr?.message); process.exit(1); }
  const e2eUser = signIn.user;

  const { data: board, error: bErr } = await admin
    .from('boards')
    .insert({ name: 'Test Board POA Import Integration (E2E)', owner_id: e2eUser.id })
    .select('id')
    .single();
  if (bErr) { console.error('board:', bErr.message); process.exit(1); }

  const { error: mErr } = await admin.from('board_members').insert({ board_id: board.id, user_id: e2eUser.id, role: 'admin' });
  if (mErr) { console.error('board_members:', mErr.message); process.exit(1); }

  const { error: gErr } = await admin
    .from('groups')
    .insert(REAL_ZONE_NAMES.map((title, i) => ({ board_id: board.id, title, color: '#00FF00', position: i })));
  if (gErr) { console.error('groups:', gErr.message); process.exit(1); }

  const { data: poa, error: poaErr } = await admin
    .from('poa')
    .upsert({ board_id: board.id, name: 'POA Import Integration E2E' }, { onConflict: 'board_id' })
    .select('id')
    .single();
  if (poaErr) { console.error('poa:', poaErr.message); process.exit(1); }

  fs.writeFileSync(seedPath, JSON.stringify({ boardId: board.id, poaId: poa.id }));
  console.log(`OK — board con las 9 zonas reales (sin mapear) sembrado. poaId=${poa.id}`);
  console.log(`Import:        http://localhost:3000/poa/${poa.id}/import`);
  console.log(`Zone mappings: http://localhost:3000/poa/${poa.id}/zone-mappings`);
})();
