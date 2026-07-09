// Verifica que borrar una foto pendiente SIN cerrar el modal revoca el
// ObjectURL de inmediato (no espera al cierre/cambio de ejecución) y elimina
// el Blob de IndexedDB, sin dejar el badge de "pendiente" colgado.
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
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Delete');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500);

    await ctx.setOffline(true);
    await page.locator('button:has-text("Evidencias")').first().click();
    await page.waitForSelector('text=Verificación de Foto', { timeout: 20000 });
    await page.setInputFiles('input[type="file"]', path.join(OUT, 'test-photo.png'));
    await page.waitForTimeout(2000);
    console.log('FOTO SUBIDA (offline)');

    const countBefore = await page.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('mantenix_offline_db');
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('pending_attachments', 'readonly');
        const req2 = tx.objectStore('pending_attachments').count();
        req2.onsuccess = () => resolve(req2.result);
      };
    }));
    console.log('BLOBS PENDIENTES ANTES DE BORRAR: ' + countBefore);

    // Borrar SIN cerrar el modal (botón de basura sobre la foto seleccionada)
    await page.locator('button:has(svg.lucide-trash-2)').first().click();
    await page.waitForTimeout(1000);

    const countAfter = await page.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('mantenix_offline_db');
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('pending_attachments', 'readonly');
        const req2 = tx.objectStore('pending_attachments').count();
        req2.onsuccess = () => resolve(req2.result);
      };
    }));
    console.log('BLOBS PENDIENTES DESPUÉS DE BORRAR (modal sigue abierto): ' + countAfter);

    // La galería del modal debe quedar vacía (sin evidencia)
    const emptyStateVisible = await page.locator('text=Sin evidencia').count();
    console.log('MODAL MUESTRA "SIN EVIDENCIA" TRAS BORRAR: ' + (emptyStateVisible > 0));
    await page.screenshot({ path: path.join(OUT, 'offline-attachment-delete-1.png') });

    await page.mouse.click(10, 10); // cerrar modal
    await page.waitForTimeout(500);
    const badgeAfterDelete = await page.locator('button:has-text("Evidencias") span').count();
    console.log('BADGE "PENDIENTE" AUSENTE TRAS BORRAR Y CERRAR: ' + (badgeAfterDelete === 0));

    await ctx.setOffline(false);

    const ok = countBefore === 1 && countAfter === 0 && emptyStateVisible > 0 && badgeAfterDelete === 0;
    console.log('E2E DELETE PENDING ATTACHMENT: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
