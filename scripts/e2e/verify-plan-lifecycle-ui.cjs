// Verifica en navegador real que la pestaña Cronograma llega hasta Costos
// sin SQL manual: panel de Confirmación visible con datos reales → Confirmar
// → panel de Cierre → Cerrar → "Ir a Costos" navega a la pestaña Costos.
// Complementa scripts/e2e/verify-close-acta-sync.cjs (que prueba las RPC
// directamente) verificando que la UI realmente las invoca.
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
const ACT = 'UI_LIFECYCLE_A';

function isoDate(d) { return d.toISOString().split('T')[0]; }

// Semana actual (lunes, UTC) — el planner abre por defecto en la semana de
// hoy; sembrar en otra semana obligaría a navegar el WeekSelector primero.
function mondayISO() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return isoDate(m);
}

async function cleanup(boardId) {
  if (!boardId) return;
  await admin.from('actas').delete().eq('board_id', boardId);
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

  let boardId, groupTitle, planWeek;
  try {
    const { data: board, error: bErr } = await admin.from('boards').insert({ name: 'E2E Plan Lifecycle UI', owner_id: userId }).select('id').single();
    if (bErr) throw new Error('board: ' + bErr.message);
    boardId = board.id;
    await admin.from('board_members').insert({ board_id: boardId, user_id: userId, role: 'admin' });

    const { data: group, error: gErr } = await admin.from('groups').insert({ board_id: boardId, title: 'Sitio UI Lifecycle', color: '#10B981', position: 0 }).select('id, title').single();
    if (gErr) throw new Error('group: ' + gErr.message);
    groupTitle = group.title;

    await admin.from('board_activity_standards').insert({
      board_id: boardId, activity_key: ACT, name: 'Corte de césped (UI E2E)', category: 'ZONA VERDE', unit: 'm2',
      rendimiento: 10, frecuencia: 4, priority: 'preferred', source: 'e2e-seed',
    });

    const { data: poa, error: poaErr } = await admin.from('poa').insert({ board_id: boardId, name: 'POA E2E UI Lifecycle' }).select('id').single();
    if (poaErr) throw new Error('poa: ' + poaErr.message);
    const { data: poaVersion, error: pvErr } = await admin.from('poa_versions')
      .insert({ poa_id: poa.id, version_number: 1, status: 'active', created_by: userId }).select('id').single();
    if (pvErr) throw new Error('poa_versions: ' + pvErr.message);
    const { data: poaActivity, error: paErr } = await admin.from('poa_activities')
      .insert({ poa_version_id: poaVersion.id, activity_key: ACT, frecuencia: 4, precio_unitario: 50000 }).select('id').single();
    if (paErr) throw new Error('poa_activities: ' + paErr.message);
    const { data: poaZone, error: pzErr } = await admin.from('poa_activity_zones')
      .insert({ poa_activity_id: poaActivity.id, zone_id: group.id, cantidad_contratada: 1000 }).select('id').single();
    if (pzErr) throw new Error('poa_activity_zones: ' + pzErr.message);

    planWeek = mondayISO(); // semana actual — evita tener que navegar el WeekSelector
    const { data: plan, error: pErr } = await admin.from('weekly_plans')
      .insert({ board_id: boardId, group_id: group.id, week_start: planWeek, period_number: 1, status: 'in_progress', created_by: userId })
      .select('id').single();
    if (pErr) throw new Error('plan: ' + pErr.message);

    const { data: item, error: iErr } = await admin.from('weekly_plan_items')
      .insert({ plan_id: plan.id, planned_sequence: 1, activity_key: ACT, poa_activity_zone_id: poaZone.id, planned_rendimiento: 10, planned_frecuencia: 4, priority: 'preferred', planned_qty: 100, unit: 'm2', planned_jr: 2.5 })
      .select('id').single();
    if (iErr) throw new Error('item: ' + iErr.message);

    const { data: exec, error: eErr } = await admin.from('weekly_plan_item_executions').insert({
      plan_item_id: item.id, execution_date: planWeek, worker_count: 2,
      started_at: `${planWeek}T07:00:00Z`, finished_at: `${planWeek}T15:00:00Z`, executed_qty: 40, status: 'verified',
      verified_by: userId, verified_at: new Date().toISOString(), created_by: userId,
    }).select('id').single();
    if (eErr) throw new Error('exec: ' + eErr.message);

    await admin.from('execution_attachments').insert({
      execution_id: exec.id, file_name: 'evidencia.jpg', file_url: 'https://example.test/evidencia.jpg',
      file_type: 'image/jpeg', uploaded_by: userId,
    });

    console.log(`SEED OK — board=${boardId} sitio="${groupTitle}" semana=${planWeek} (1 jornada verified con evidencia)`);

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

      await page.goto(`http://localhost:3000/dashboard?boardId=${boardId}&view=planner`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // Seleccionar el sitio sembrado (location selector → "Cobertura Global")
      await page.locator('button:has-text("Cobertura Global")').click();
      await page.locator(`button:has-text("${groupTitle}")`).click();
      await page.waitForTimeout(2000);

      await page.waitForSelector('text=Todas las jornadas verificadas', { timeout: 30000 });
      await page.screenshot({ path: path.join(OUT, 'lifecycle-1-confirmacion.png') });
      const readyToConfirm = await page.locator('text=Todas las jornadas verificadas').count();
      console.log('PANEL CONFIRMACIÓN VISIBLE (todo verificado): ' + (readyToConfirm > 0));
      if (readyToConfirm === 0) throw new Error('El panel de Confirmación no llegó al estado "todo verificado" — revisar semana/seed');

      // Confirmar
      await page.locator('button:has-text("Confirmar plan")').click();
      await page.waitForSelector('text=Confirmado', { timeout: 30000 });
      console.log('PLAN CONFIRMADO (badge "Confirmado" visible)');
      await page.screenshot({ path: path.join(OUT, 'lifecycle-2-confirmado.png') });

      // Cerrar
      await page.waitForSelector('button:has-text("Cerrar plan")', { timeout: 30000 });
      await page.locator('button:has-text("Cerrar plan")').click();
      await page.waitForSelector('text=Plan cerrado correctamente', { timeout: 30000 });
      console.log('PLAN CERRADO ("Plan cerrado correctamente" visible)');
      await page.screenshot({ path: path.join(OUT, 'lifecycle-3-cerrado.png') });

      // Ir a Costos
      await page.locator('button:has-text("Ir a Costos")').click();
      await page.waitForSelector('text=Actas Certificadas', { timeout: 30000 });
      console.log('NAVEGÓ A COSTOS ("Actas Certificadas" visible)');
      await page.screenshot({ path: path.join(OUT, 'lifecycle-4-costos.png') });

      const { data: finalPlan } = await admin.from('weekly_plans').select('status').eq('board_id', boardId).single();
      console.log('ESTADO FINAL EN BD: ' + finalPlan.status);

      console.log('CONSOLE-ERRORS: ' + consoleErrors.length);
      for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log('  ERR: ' + e);

      const ok = finalPlan.status === 'closed' && consoleErrors.length === 0;
      console.log('E2E PLAN LIFECYCLE UI: ' + (ok ? 'PASS' : 'FAIL'));
      process.exitCode = ok ? 0 : 1;
    } finally {
      await browser.close();
    }
  } finally {
    await cleanup(boardId);
    console.log('Limpieza: board de prueba eliminado.');
  }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
