// Crea (o elimina con --cleanup) un usuario E2E temporal con membresía admin
// en todos los boards. Ejecutar desde la raíz del repo (usa .env.local).
// Credenciales efímeras en el tmp del sistema, nunca en el repo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const { createClient } = req('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const EMAIL = 'claude-e2e-nav@mantenix.dev';
const credsPath = path.join(os.tmpdir(), 'mantenix-e2e-creds.json');

async function removeUser() {
  // admin.auth.admin.listUsers({perPage:1000}) puede devolver 500 "Database
  // error finding users" (visto en la práctica, no documentado por Supabase) —
  // cuando eso pasa, `data.users` llega vacío y este removeUser reportaba
  // "no existía" sin borrar nada, dejando el usuario E2E huérfano. Se resuelve
  // el id por dos vías que no dependen de ese endpoint, en orden:
  //   1. sign-in normal con las creds ya guardadas por este mismo script
  //      (falla si credsPath ya se borró o la contraseña cambió).
  //   2. admin.auth.admin.generateLink() — no envía nada, solo genera un link
  //      y de paso devuelve data.user con el id; en la práctica no se vio
  //      afectado por el mismo 500 que listUsers().
  let userId = null;
  if (fs.existsSync(credsPath)) {
    const { password } = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const { data: signIn } = await anon.auth.signInWithPassword({ email: EMAIL, password });
    userId = signIn?.user?.id ?? null;
  }
  if (!userId) {
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
    userId = link?.user?.id ?? null;
  }
  if (!userId) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = data?.users?.find((x) => x.email === EMAIL);
    userId = u?.id ?? null;
  }
  if (!userId) return false;
  await admin.from('board_members').delete().eq('user_id', userId);
  await admin.auth.admin.deleteUser(userId);
  return true;
}

(async () => {
  if (process.argv.includes('--cleanup')) {
    const removed = await removeUser();
    try { fs.unlinkSync(credsPath); } catch {}
    console.log(removed ? 'E2E user eliminado' : 'E2E user no existía');
    return;
  }

  await removeUser(); // idempotente
  const password = 'E2e!' + crypto.randomBytes(9).toString('base64url');
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: 'Claude E2E Nav' },
  });
  if (error) { console.error('createUser:', error.message); process.exit(1); }

  const { data: boards, error: bErr } = await admin.from('boards').select('id');
  if (bErr) { console.error('boards:', bErr.message); process.exit(1); }
  const { error: mErr } = await admin.from('board_members').insert(
    boards.map((b) => ({ board_id: b.id, user_id: created.user.id, role: 'admin' }))
  );
  if (mErr) { console.error('board_members:', mErr.message); process.exit(1); }

  fs.writeFileSync(credsPath, JSON.stringify({ email: EMAIL, password }));
  console.log(`OK — usuario E2E creado con acceso a ${boards.length} boards (creds en ${credsPath})`);
})();
