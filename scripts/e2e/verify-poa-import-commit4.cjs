// E2E del pulido de UX de /poa/[poaId]/import (Commit 4): mientras la
// importación está en curso, el input de archivo queda deshabilitado y hay
// un texto de progreso explícito; antes de importar existe un enlace
// "Seleccionar otro archivo" para reiniciar sin recargar. No prueba el
// caso success (requeriría zonas+catálogo resueltos) — eso queda cubierto
// por PoaImportContainer.test.tsx con la capa de servicio mockeada.
// Requiere: dev server, usuario E2E, seed-poa-import.cjs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { poaId } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-poa-import-seed.json'), 'utf8'));
const EXCEL_PATH = path.join(process.cwd(), 'POA 2026 V.02 Ene.26-2026.xlsx');
const consoleErrors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    const targetUrl = `http://localhost:3000/poa/${poaId}/import`;

    await ctx.request.get(targetUrl, { timeout: 120000 });
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

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Selecciona el Excel del POA', { timeout: 90000 });

    // 1. Archivo seleccionado, sin importar todavía: enlace de reinicio visible.
    await page.setInputFiles('input[type="file"]', EXCEL_PATH);
    await page.waitForSelector('text=POA 2026', { timeout: 10000 });
    const resetLinkBefore = await page.locator('button:has-text("Seleccionar otro archivo")').count();
    console.log('Enlace "Seleccionar otro archivo" visible antes de importar:', resetLinkBefore > 0);
    await page.screenshot({ path: path.join(OUT, 'poa-import-c4-1-archivo-seleccionado.png') });

    // 2. Importar — mientras está en curso, el input debe estar disabled y
    //    debe verse el texto de progreso explícito.
    await page.locator('button:has-text("Importar")').click();
    await page.waitForSelector('text=Importando…', { timeout: 15000 });
    const inputDisabledDuringImport = await page.locator('input[type="file"]').isDisabled();
    const progressTextVisible = await page.locator('text=Leyendo el archivo, validando').count();
    console.log('Input de archivo disabled durante la importación:', inputDisabledDuringImport);
    console.log('Texto de progreso visible durante la importación:', progressTextVisible > 0);
    await page.screenshot({ path: path.join(OUT, 'poa-import-c4-2-en-curso.png') });

    // 3. Resultado — con este seed sin zonas/catálogo resueltos, es 'blocked'.
    //    "Importar" debe seguir presente y habilitado (reintentar es válido
    //    en blocked, a diferencia de success).
    await page.waitForSelector('text=/zonas? sin mapear/', { timeout: 60000 });
    const importButtonAfterBlocked = page.locator('button:has-text("Importar")').first();
    const importVisibleAfterBlocked = await importButtonAfterBlocked.count();
    const importEnabledAfterBlocked = importVisibleAfterBlocked > 0 ? await importButtonAfterBlocked.isEnabled() : false;
    console.log('Botón "Importar" presente tras blocked:', importVisibleAfterBlocked > 0);
    console.log('Botón "Importar" habilitado tras blocked:', importEnabledAfterBlocked);
    const inputEnabledAfterResult = await page.locator('input[type="file"]').isEnabled();
    console.log('Input de archivo vuelve a estar habilitado tras el resultado:', inputEnabledAfterResult);
    await page.screenshot({ path: path.join(OUT, 'poa-import-c4-3-resultado.png') });

    const ok = resetLinkBefore > 0 && inputDisabledDuringImport && progressTextVisible > 0
      && importVisibleAfterBlocked > 0 && importEnabledAfterBlocked && inputEnabledAfterResult
      && consoleErrors.length === 0;

    if (consoleErrors.length) console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
    console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    if (!ok) process.exitCode = 1;
  } catch (err) {
    console.error('DRIVER ERROR:', err.message);
    try { await (await (await browser.contexts())[0]?.pages())?.[0]?.screenshot({ path: path.join(OUT, 'poa-import-c4-error.png') }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
