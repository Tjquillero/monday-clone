// Siembra (o limpia con --cleanup) un board/poa de prueba mínimo, sin
// mapeos de zona ni catálogo resuelto, para verificar el esqueleto de la
// pantalla /poa/[poaId]/import (Commit 1 — solo prueba que la invocación y
// el renderizado tipado de ImportPoaResult funcionan; el resultado esperado
// aquí es 'blocked', no 'success').
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

const seedPath = path.join(os.tmpdir(), 'mantenix-e2e-poa-import-seed.json');

(async () => {
  if (process.argv.includes('--cleanup')) {
    if (fs.existsSync(seedPath)) {
      const { boardId } = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      const { error } = await admin.from('boards').delete().eq('id', boardId);
      console.log(error ? 'cleanup error: ' + error.message : 'Board/poa de prueba eliminados');
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
    .insert({ name: 'Test Board POA Import UI (E2E)', owner_id: e2eUser.id })
    .select('id')
    .single();
  if (bErr) { console.error('board:', bErr.message); process.exit(1); }

  const { error: mErr } = await admin.from('board_members').insert({ board_id: board.id, user_id: e2eUser.id, role: 'admin' });
  if (mErr) { console.error('board_members:', mErr.message); process.exit(1); }

  const { data: poa, error: poaErr } = await admin
    .from('poa')
    .upsert({ board_id: board.id, name: 'POA Import UI E2E' }, { onConflict: 'board_id' })
    .select('id')
    .single();
  if (poaErr) { console.error('poa:', poaErr.message); process.exit(1); }

  fs.writeFileSync(seedPath, JSON.stringify({ boardId: board.id, poaId: poa.id }));
  console.log(`OK — board/poa sembrados. poaId=${poa.id}`);
  console.log(`URL a verificar: http://localhost:3000/poa/${poa.id}/import`);
})();
