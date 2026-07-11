// Siembra (o limpia con --cleanup) un board/poa/groups de prueba con UN
// mapeo de zona pendiente (poa_zone_mappings.group_id = NULL), para
// verificar en navegador la pantalla /poa/[poaId]/zone-mappings (ADR-0004).
// Usa el usuario E2E como created_by (crear el usuario antes con
// .claude/skills/verify-nav/scripts/e2e-user.cjs).
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

const seedPath = path.join(os.tmpdir(), 'mantenix-e2e-zone-mapping-seed.json');

(async () => {
  if (process.argv.includes('--cleanup')) {
    if (fs.existsSync(seedPath)) {
      const { boardId } = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      // poa -> poa_zone_mappings cae por ON DELETE CASCADE; groups y
      // board_members caen por ON DELETE CASCADE del board.
      const { error } = await admin.from('boards').delete().eq('id', boardId);
      console.log(error ? 'cleanup error: ' + error.message : 'Board/poa/groups/mapeo de prueba eliminados');
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
    .insert({ name: 'Test Board Zone Mapping UI (E2E)', owner_id: e2eUser.id })
    .select('id')
    .single();
  if (bErr) { console.error('board:', bErr.message); process.exit(1); }

  const { error: mErr } = await admin.from('board_members').insert({ board_id: board.id, user_id: e2eUser.id, role: 'admin' });
  if (mErr) { console.error('board_members:', mErr.message); process.exit(1); }

  const { data: groups, error: gErr } = await admin
    .from('groups')
    .insert([
      { board_id: board.id, title: 'Zona Real Disponible (E2E)', color: '#00FF00', position: 0 },
    ])
    .select('id, title');
  if (gErr) { console.error('groups:', gErr.message); process.exit(1); }

  const { data: poa, error: poaErr } = await admin
    .from('poa')
    .upsert({ board_id: board.id, name: 'POA Zone Mapping E2E' }, { onConflict: 'board_id' })
    .select('id')
    .single();
  if (poaErr) { console.error('poa:', poaErr.message); process.exit(1); }

  // El mapeo pendiente: excel_zone_name real del POA sin group_id — simula
  // Regla 5 de ADR-0004 (el group original se eliminó, queda por reasignar).
  const { error: pzErr } = await admin.from('poa_zone_mappings').insert({
    poa_id: poa.id,
    excel_zone_name: 'PLAZA DE PTO COLOMBIA (E2E)',
    group_id: null,
    created_by: e2eUser.id,
  });
  if (pzErr) { console.error('poa_zone_mappings:', pzErr.message); process.exit(1); }

  fs.writeFileSync(seedPath, JSON.stringify({ boardId: board.id, poaId: poa.id, groupTitle: groups[0].title }));
  console.log(`OK — board/poa/group sembrados. poaId=${poa.id}. Un mapeo pendiente: "PLAZA DE PTO COLOMBIA (E2E)" -> resolver a "${groups[0].title}".`);
  console.log(`URL a verificar: http://localhost:3000/poa/${poa.id}/zone-mappings`);
})();
