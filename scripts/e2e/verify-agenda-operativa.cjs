// Verifica en navegador real la Agenda Operativa (ADR-0006, Fase 1 / MVP):
// semaforo, contadores y el enlace "listo para confirmar" navegando a
// Cronograma con el sitio correcto ya seleccionado (deep-link groupId).
// Complementa la verificacion SQL de get_board_operational_agenda
// (supabase/tests/23_board_operational_agenda.sql) probando que la UI
// realmente la consume y que el deep-link de sitio funciona de punta a punta.
//
// Requiere: dev server en :3000, usuario E2E creado.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { createClient } = req('@supabase/supabase-js');
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function isoDate(d) { return d.toISOString().split('T')[0]; }
function mondayISO() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff)));
}

async function cleanup(boardId) {
  if (!boardId) return;
  await admin.from('weekly_plans').delete().eq('board_id', boardId);
  await admin.from('poa').delete().eq('board_id', boardId);
  await admin.from('board_activity_standards').delete().eq('board_id', boardId);
  await admin.from('boards').delete().eq('id', boardId);
}

(async () => {
  const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.user) { console.error('Usuario E2E no existe:', signInErr?.message); process.exit(1); }
  const userId = signIn.user.id;

  let boardId, groupVerdeId, groupVerdeTitle, groupRojoTitle;
  try {
    const { data: board, error: bErr } = await admin.from('boards').insert({ name: 'E2E Agenda Operativa', owner_id: userId }).select('id').single();
    if (bErr) throw new Error('board: ' + bErr.message);
    boardId = board.id;
    await admin.from('board_members').insert({ board_id: boardId, user_id: userId, role: 'admin' });

    groupVerdeTitle = 'Sitio Verde E2E';
    groupRojoTitle = 'Sitio Rojo E2E';
    const { data: groups, error: gErr } = await admin.from('groups').insert([
      { board_id: boardId, title: groupVerdeTitle, color: '#10B981', position: 0 },
      { board_id: boardId, title: groupRojoTitle, color: '#EF4444', position: 1 },
    ]).select('id, title');
    if (gErr) throw new Error('groups: ' + gErr.message);
    const groupVerde = groups.find(g => g.title === groupVerdeTitle);
    const groupRojo = groups.find(g => g.title === groupRojoTitle);
    groupVerdeId = groupVerde.id;

    const { data: poa, error: poaErr } = await admin.from('poa').insert({ board_id: boardId, name: 'POA E2E Agenda' }).select('id').single();
    if (poaErr) throw new Error('poa: ' + poaErr.message);
    const { data: poaVersion, error: pvErr } = await admin.from('poa_versions')
      .insert({ poa_id: poa.id, version_number: 1, status: 'active', created_by: userId }).select('id').single();
    if (pvErr) throw new Error('poa_versions: ' + pvErr.message);

    async function seedPlanWithExecution(group, activityKey, execStatus, withAttachment) {
      const { data: pa, error: paErr } = await admin.from('poa_activities')
        .insert({ poa_version_id: poaVersion.id, activity_key: activityKey, frecuencia: 4, precio_unitario: 50000 }).select('id').single();
      if (paErr) throw new Error('poa_activities: ' + paErr.message);
      const { data: paz, error: pzErr } = await admin.from('poa_activity_zones')
        .insert({ poa_activity_id: pa.id, zone_id: group.id, cantidad_contratada: 1000 }).select('id').single();
      if (pzErr) throw new Error('poa_activity_zones: ' + pzErr.message);

      const week = mondayISO();
      const { data: plan, error: planErr } = await admin.from('weekly_plans')
        .insert({ board_id: boardId, group_id: group.id, week_start: week, period_number: 1, status: 'in_progress', created_by: userId })
        .select('id').single();
      if (planErr) throw new Error('plan: ' + planErr.message);

      const { data: item, error: itemErr } = await admin.from('weekly_plan_items')
        .insert({ plan_id: plan.id, planned_sequence: 1, activity_key: activityKey, poa_activity_zone_id: paz.id, planned_rendimiento: 10, planned_frecuencia: 4, priority: 'preferred', planned_qty: 100, unit: 'm2', planned_jr: 2.5 })
        .select('id').single();
      if (itemErr) throw new Error('item: ' + itemErr.message);

      const today = isoDate(new Date());
      const { data: exec, error: execErr } = await admin.from('weekly_plan_item_executions').insert({
        plan_item_id: item.id, execution_date: today, worker_count: 2,
        started_at: `${today}T07:00:00Z`, finished_at: `${today}T15:00:00Z`, executed_qty: 40, status: execStatus,
        verified_by: execStatus === 'verified' ? userId : null, verified_at: execStatus === 'verified' ? new Date().toISOString() : null,
        created_by: userId,
      }).select('id').single();
      if (execErr) throw new Error('exec: ' + execErr.message);

      if (withAttachment) {
        await admin.from('execution_attachments').insert({
          execution_id: exec.id, file_name: 'evidencia.jpg', file_url: 'https://example.test/evidencia.jpg',
          file_type: 'image/jpeg', uploaded_by: userId,
        });
      }
      return plan.id;
    }

    // Sitio Verde: 1 verified con evidencia -> 100% verde, listo para confirmar.
    await seedPlanWithExecution(groupVerde, 'E2E_AGENDA_VERDE', 'verified', true);
    // Sitio Rojo: 1 reported -> 0% rojo, pendiente de verificar, NO listo para confirmar.
    await seedPlanWithExecution(groupRojo, 'E2E_AGENDA_ROJO', 'reported', false);

    console.log(`SEED OK — board=${boardId}, "${groupVerdeTitle}" (verde/confirmable), "${groupRojoTitle}" (rojo/pendiente)`);

    // ── Navegador ──────────────────────────────────────────────────────────
    const consoleErrors = [];
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const page = await ctx.newPage();
      page.setDefaultNavigationTimeout(120000);
      page.setDefaultTimeout(90000);
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

      await ctx.request.get('http://localhost:3000/dashboard', { timeout: 120000 });
      const hasSession = () => page.evaluate(() => document.cookie.includes('-auth-token'));
      await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
      let loggedIn = false;
      for (let i = 0; i < 5 && !loggedIn; i++) {
        if (!(await hasSession())) {
          if (!page.url().includes('/login')) await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
          try { await page.waitForSelector('input[type="email"]', { timeout: 20000 }); } catch { continue; }
          try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
          await page.fill('input[type="email"]', email);
          await page.fill('input[type="password"]', password);
          await page.locator('button:has-text("Iniciar Sesión")').last().click();
          try { await page.waitForURL('**/dashboard**', { timeout: 60000, waitUntil: 'commit' }); } catch {}
        }
        if (await hasSession()) loggedIn = true;
      }
      if (!loggedIn) throw new Error('sin sesión');
      await page.waitForTimeout(5000);

      await page.goto(`http://localhost:3000/dashboard?boardId=${boardId}&view=agenda`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);

      await page.waitForSelector('text=Agenda Operativa', { timeout: 20000 });
      console.log('AGENDA VISIBLE: true');
      await page.screenshot({ path: path.join(OUT, 'agenda-1-hoy.png') });

      // innerText aplica text-transform CSS (el semáforo usa "uppercase") — se
      // compara en mayúsculas para no depender de en qué bloque de la página
      // aparece cada nombre de sitio.
      const bodyText = await page.$eval('body', (b) => b.innerText);
      const bodyTextUpper = bodyText.toUpperCase();
      console.log('SEMAFORO MUESTRA SITIO VERDE: ' + bodyTextUpper.includes(groupVerdeTitle.toUpperCase()));
      console.log('SEMAFORO MUESTRA SITIO ROJO: ' + bodyTextUpper.includes(groupRojoTitle.toUpperCase()));
      console.log('INCIDENCIA "LISTO PARA CONFIRMAR" VISIBLE: ' + bodyTextUpper.includes('LISTO PARA CONFIRMAR'));

      // Clic en el enlace "Ir a Cronograma" de la incidencia del Sitio Verde
      // (busca la fila que contiene el nombre del sitio, luego el enlace dentro).
      const incidenciaRow = page.locator('li', { hasText: groupVerdeTitle });
      await incidenciaRow.locator('a:has-text("Ir a Cronograma")').click();
      await page.waitForURL(new RegExp(`view=planner.*groupId=${groupVerdeId}|groupId=${groupVerdeId}.*view=planner`), { timeout: 20000 });
      console.log('NAVEGACION A CRONOGRAMA CON SITIO CORRECTO: OK, url=' + page.url());

      await page.waitForTimeout(2000);
      const cronogramaText = await page.$eval('body', (b) => b.innerText);
      const cronogramaMatches = cronogramaText.toUpperCase().includes(groupVerdeTitle.toUpperCase());
      console.log('CRONOGRAMA MUESTRA EL SITIO SELECCIONADO: ' + cronogramaMatches);
      await page.screenshot({ path: path.join(OUT, 'agenda-2-cronograma-deeplink.png') });

      console.log('CONSOLE-ERRORS: ' + consoleErrors.length);
      for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log('  ERR: ' + e);

      const ok = consoleErrors.length === 0
        && bodyTextUpper.includes(groupVerdeTitle.toUpperCase()) && bodyTextUpper.includes(groupRojoTitle.toUpperCase())
        && cronogramaMatches
        && page.url().includes(`groupId=${groupVerdeId}`) && page.url().includes('view=planner');
      console.log('E2E AGENDA OPERATIVA: ' + (ok ? 'PASS' : 'FAIL'));
      process.exitCode = ok ? 0 : 1;
    } finally {
      await browser.close();
    }
  } finally {
    await cleanup(boardId);
    console.log('Limpieza: board de prueba eliminado.');
  }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
