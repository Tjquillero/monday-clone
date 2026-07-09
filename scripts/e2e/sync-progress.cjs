// Verifica el indicador de progreso real ("Sincronizando X/Y...") con varios
// ítems en cola (2 fotos), para que la ventana de sincronización sea lo
// bastante ancha como para observarla (con 1 solo ítem, el ciclo completo de
// RPC/Storage puede terminar antes de que el polling del test lo capture).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { activityNames, groupTitle } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-seed.json'), 'utf8'));

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
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Progress');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500);

    await ctx.setOffline(true);
    await page.locator('button:has-text("Evidencias")').first().click();
    await page.waitForSelector('text=Verificación de Foto', { timeout: 20000 });
    // Subir 2 fotos distintas offline
    await page.setInputFiles('input[type="file"]', path.join(OUT, 'test-photo.png'));
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Añadir")').click();
    await page.setInputFiles('input[type="file"]', path.join(OUT, 'test-photo.png'));
    await page.waitForTimeout(1000);
    await page.mouse.click(10, 10); // cerrar modal
    await page.waitForTimeout(500);

    const badgeCount = await page.locator('button:has-text("Evidencias") span').first().innerText().catch(() => null);
    console.log('BADGE DE EVIDENCIAS PENDIENTES: ' + badgeCount);

    await ctx.setOffline(false);

    let progressSeen = false;
    let maxTotal = 0;
    for (let i = 0; i < 60; i++) { // ~12s de polling a 200ms
      const matches = await page.locator('text=/Sincronizando \\d+\\/\\d+/').count();
      if (matches > 0) {
        const txt = await page.locator('text=/Sincronizando \\d+\\/\\d+/').first().innerText({ timeout: 500 }).catch(() => null);
        if (txt) {
          progressSeen = true;
          const m = txt.match(/(\d+)\/(\d+)/);
          if (m) maxTotal = Math.max(maxTotal, parseInt(m[2], 10));
          await page.screenshot({ path: path.join(OUT, 'sync-progress-1.png') });
        }
      }
      await page.waitForTimeout(200);
    }
    console.log('PROGRESO "Sincronizando X/Y" VISTO: ' + progressSeen + (progressSeen ? ` (total detectado: ${maxTotal})` : ''));

    await page.waitForTimeout(2000);
    const badgeGone = await page.locator('button:has-text("Evidencias") span').count();
    console.log('BADGE DESAPARECE TRAS SINCRONIZAR: ' + (badgeGone === 0));

    const ok = progressSeen && maxTotal >= 2 && badgeGone === 0;
    console.log('E2E SYNC PROGRESS: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
