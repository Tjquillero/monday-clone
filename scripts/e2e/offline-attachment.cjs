// Verifica el Incremento 3 del soporte offline (cola de Blobs de evidencia):
// subir una foto SIN CONEXIÓN debe encolarla localmente (Blob en IndexedDB,
// no perderse), mostrarla de inmediato en la galería (URL local transitoria,
// Sección 4 del diseño offline), sobrevivir un reload offline, y al reconectar
// subirse de verdad a Storage + insertarse en execution_attachments.
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
const consoleErrors = [];

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
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

    // login
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

    // ── 1. Crear un borrador de jornada EN LÍNEA ──
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Evidencia');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500);
    console.log('BORRADOR CREADO EN LÍNEA');

    // ── 2. Desconectar y subir una foto ──
    await ctx.setOffline(true);
    console.log('CONTEXTO OFFLINE ACTIVADO');

    await page.locator('button:has-text("Evidencias")').first().click();
    await page.waitForSelector('text=Verificación de Foto', { timeout: 20000 });
    await page.setInputFiles('input[type="file"]', path.join(OUT, 'test-photo.png'));
    await page.waitForTimeout(2000);

    // La foto debe verse de inmediato (URL local transitoria)
    const photoVisible = await page.locator('img[alt="Evidencia"]').count();
    console.log('FOTO VISIBLE EN EL MODAL TRAS SUBIR OFFLINE: ' + (photoVisible > 0));
    await page.screenshot({ path: path.join(OUT, 'offline-attachment-1-modal.png') });

    await page.mouse.click(10, 10); // backdrop del modal (onClick={onClose})
    await page.waitForTimeout(500);

    let badgeVisibleOffline = false;
    try {
      await page.waitForSelector('text=Evidencias >> xpath=.. >> text=1', { timeout: 5000 });
      badgeVisibleOffline = true;
    } catch {
      // fallback: buscar el badge ambar cerca del botón
      const badge = await page.locator('button:has-text("Evidencias") span').count();
      badgeVisibleOffline = badge > 0;
    }
    console.log('BADGE "1 PENDIENTE" VISIBLE TRAS CERRAR MODAL: ' + badgeVisibleOffline);
    await page.screenshot({ path: path.join(OUT, 'offline-attachment-2-badge.png') });

    // ── 3. Recargar offline: el Blob pendiente debe sobrevivir ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForTimeout(1000);
    const badgeAfterReload = await page.locator('button:has-text("Evidencias") span').count();
    console.log('BADGE SOBREVIVE RELOAD OFFLINE (Blob persistido en IndexedDB): ' + (badgeAfterReload > 0));

    // ── 4. Reconectar: useOfflineSync debe subir el Blob solo ──
    await ctx.setOffline(false);
    console.log('CONTEXTO ONLINE RESTAURADO');
    await page.waitForTimeout(8000); // debounce (1.5s) + upload a Storage + insert

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForTimeout(1000);
    const badgeAfterSync = await page.locator('button:has-text("Evidencias") span').count();
    console.log('BADGE DESAPARECE TRAS SINCRONIZAR: ' + (badgeAfterSync === 0));

    // Verificar en la base real: fila en execution_attachments con file_url de Supabase Storage
    const { data: execs } = await admin
      .from('weekly_plan_item_executions')
      .select('id, crew_name')
      .eq('crew_name', 'Cuadrilla Evidencia');
    const execId = execs?.[0]?.id;
    let dbAttachmentOk = false;
    let storageUrl = null;
    if (execId) {
      const { data: atts } = await admin.from('execution_attachments').select('*').eq('execution_id', execId);
      dbAttachmentOk = (atts?.length ?? 0) > 0;
      storageUrl = atts?.[0]?.file_url ?? null;
    }
    console.log('FILA REAL EN execution_attachments: ' + dbAttachmentOk + (storageUrl ? ' (' + storageUrl + ')' : ''));

    console.log('CONSOLE-ERRORS: ' + consoleErrors.length);
    for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ERR: ' + e);

    const ok = photoVisible > 0 && badgeVisibleOffline && badgeAfterReload > 0 && badgeAfterSync === 0 && dbAttachmentOk;
    console.log('E2E OFFLINE ATTACHMENT SYNC: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
