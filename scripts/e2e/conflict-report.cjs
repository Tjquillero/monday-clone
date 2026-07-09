// Verifica el Incremento 4b (bandeja de conflictos) con el caso real que
// pidió el usuario: reportar offline una jornada que YA fue reportada por
// otra vía mientras el dispositivo estuvo desconectado. report_execution
// debe rechazar con el error semántico real ("no está en draft"), el comando
// debe marcarse 'conflicto' (no reintentarse solo), aparecer en la bandeja,
// y "Descartar" debe poder limpiarlo.
// Requiere: dev server, usuario E2E, plan sembrado (seed-plan.cjs).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');
const { createClient } = req('@supabase/supabase-js');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { activityNames, groupTitle } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-seed.json'), 'utf8'));

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);

    await ctx.request.get('http://localhost:3000/my-work', { timeout: 120000 });
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

    const activity = activityNames[0];

    // ── 1. Crear un borrador EN LÍNEA ──
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Conflicto');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500);
    console.log('BORRADOR CREADO EN LÍNEA');

    // ── 2. Desconectar y reportar (queda encolado, no se envía) ──
    await ctx.setOffline(true);
    await page.locator('button:has-text("Reportar")').click();
    await page.waitForSelector('text=Pendiente de sincronizar', { timeout: 15000 });
    console.log('REPORT_EXECUTION ENCOLADO OFFLINE');

    // ── 3. Simular que ALGUIEN MÁS ya reportó esa misma jornada mientras
    //      el dispositivo seguía offline (ej. el asistente, desde otra
    //      sesión) — update directo server-side, bypass de RLS via service role.
    const { data: execs } = await admin
      .from('weekly_plan_item_executions')
      .select('id, status')
      .eq('crew_name', 'Cuadrilla Conflicto');
    const execId = execs[0].id;
    const { error: updErr } = await admin
      .from('weekly_plan_item_executions')
      .update({ status: 'reported' })
      .eq('id', execId);
    console.log('EJECUCIÓN MARCADA "reported" POR OTRA VÍA (simulado): ' + !updErr);

    // ── 4. Reconectar: el comando encolado debe fallar con el error
    //      semántico real (no de red) y quedar en conflicto ──
    await ctx.setOffline(false);
    await page.waitForTimeout(8000); // debounce + intento de RPC + clasificación del error

    const conflictBadgeVisible = (await page.locator('[title*="conflicto"]:visible').count()) > 0;
    console.log('BADGE DE CONFLICTO VISIBLE TRAS RECONECTAR: ' + conflictBadgeVisible);
    await page.screenshot({ path: path.join(OUT, 'conflict-1-badge.png') });

    await page.locator('[title*="conflicto"]:visible').first().click();
    await page.waitForSelector('text=Conflictos de sincronización', { timeout: 10000 });
    const detailVisible = await page.locator('text=/draft/i').count();
    console.log('DETALLE DEL CONFLICTO MENCIONA "draft" (error semántico real, no genérico): ' + (detailVisible > 0));
    await page.screenshot({ path: path.join(OUT, 'conflict-2-tray.png') });

    // ── 5. Confirmar que NO se reintenta solo: forzar otro triggerSync
    //      (clic en el indicador principal) y verificar que sigue en conflicto ──
    await page.mouse.click(10, 10); // cerrar bandeja
    await page.waitForTimeout(300);
    const syncButtons = await page.locator('button:has-text("Sincronizado"), button:has-text("Sin conexión"), button:has-text("Error")').all();
    if (syncButtons.length > 0) { await syncButtons[0].click(); await page.waitForTimeout(3000); }

    const { data: execAfterRetryAttempt } = await admin
      .from('weekly_plan_item_executions')
      .select('status, updated_by')
      .eq('id', execId)
      .single();
    console.log('ESTADO SIGUE "reported" SIN CAMBIOS TRAS UN triggerSync ADICIONAL (no hubo reintento automático dañino): ' + (execAfterRetryAttempt.status === 'reported'));

    const conflictBadgeStill = (await page.locator('[title*="conflicto"]:visible').count()) > 0;
    console.log('CONFLICTO SIGUE VISIBLE (no se descartó solo): ' + conflictBadgeStill);

    // ── 6. Descartar el conflicto desde la bandeja ──
    await page.locator('[title*="conflicto"]:visible').first().click();
    await page.waitForSelector('text=Conflictos de sincronización', { timeout: 10000 });
    await page.locator('button:has-text("Descartar")').first().click();
    await page.waitForTimeout(1500);
    const emptyTrayVisible = await page.locator('text=Sin conflictos pendientes').count();
    console.log('BANDEJA VACÍA TRAS DESCARTAR: ' + (emptyTrayVisible > 0));
    await page.screenshot({ path: path.join(OUT, 'conflict-3-discarded.png') });

    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    const badgeGoneAfterDiscard = (await page.locator('[title*="conflicto"]:visible').count()) === 0;
    console.log('BADGE DE CONFLICTO YA NO APARECE EN EL INDICADOR: ' + badgeGoneAfterDiscard);

    const idbCommandsAfterDiscard = await page.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('mantenix_offline_db');
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('domain_commands', 'readonly');
        const req2 = tx.objectStore('domain_commands').count();
        req2.onsuccess = () => resolve(req2.result);
      };
    }));
    console.log('domain_commands EN IDB TRAS DESCARTAR: ' + idbCommandsAfterDiscard);

    const ok = conflictBadgeVisible && detailVisible > 0
      && execAfterRetryAttempt.status === 'reported' && conflictBadgeStill
      && emptyTrayVisible > 0 && badgeGoneAfterDiscard && idbCommandsAfterDiscard === 0;
    console.log('E2E CONFLICT TRAY (report ya reportado): ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
