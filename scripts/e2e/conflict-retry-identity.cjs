// Verifica que "Reintentar" en la bandeja de conflictos NO reconstruye un
// comando nuevo "parecido" — debe conservar exactamente el mismo id,
// entity_id, type y payload (command_id incluido), cambiando únicamente
// status/attempts/last_error. Captura el registro completo de IndexedDB
// antes y después del clic, y compara campo por campo.
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

async function readDomainCommands(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('mantenix_offline_db');
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction('domain_commands', 'readonly');
      const req2 = tx.objectStore('domain_commands').getAll();
      req2.onsuccess = () => resolve(req2.result);
    };
  }));
}

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

    // ── 1. Crear un borrador y reportarlo offline (queda encolado) ──
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Retry Identity');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500);

    await ctx.setOffline(true);
    await page.locator('button:has-text("Reportar")').click();
    await page.waitForSelector('text=Pendiente de sincronizar', { timeout: 15000 });

    // ── 2. Provocar el conflicto: otra vía ya reportó la misma jornada ──
    const { data: execs } = await admin
      .from('weekly_plan_item_executions')
      .select('id')
      .eq('crew_name', 'Cuadrilla Retry Identity');
    const execId = execs[0].id;
    await admin.from('weekly_plan_item_executions').update({ status: 'reported' }).eq('id', execId);

    await ctx.setOffline(false);
    await page.waitForTimeout(8000); // reconecta, intenta, cae en conflicto

    const before = await readDomainCommands(page);
    console.log('COMANDOS EN IDB ANTES DE REINTENTAR:', JSON.stringify(before, null, 2));
    if (before.length !== 1) throw new Error('Se esperaba exactamente 1 comando en conflicto, hay ' + before.length);
    const beforeCmd = before[0];

    // ── 3. Reintentar (el conflicto real sigue vigente: va a volver a fallar
    //      y volver a marcarse 'conflicto' — eso es lo esperado, lo que nos
    //      interesa es si el REGISTRO es el mismo, no si el reintento "gana") ──
    await page.locator('[title*="conflicto"]:visible').first().click();
    await page.waitForSelector('text=Conflictos de sincronización', { timeout: 10000 });
    await page.locator('button:has-text("Reintentar")').first().click();
    await page.waitForTimeout(4000); // triggerSync() interno de retry() + reintento real + reclasificación

    const after = await readDomainCommands(page);
    console.log('COMANDOS EN IDB DESPUÉS DE REINTENTAR:', JSON.stringify(after, null, 2));
    if (after.length !== 1) throw new Error('Se esperaba que siguiera existiendo exactamente 1 comando, hay ' + after.length);
    const afterCmd = after[0];

    const sameId = beforeCmd.id === afterCmd.id;
    const sameType = beforeCmd.type === afterCmd.type;
    const sameEntity = beforeCmd.entity_id === afterCmd.entity_id;
    const samePayload = JSON.stringify(beforeCmd.payload) === JSON.stringify(afterCmd.payload);
    const sameCreatedAt = beforeCmd.created_at === afterCmd.created_at;
    const statusWentThroughPendingBackToConflicto = afterCmd.status === 'conflicto'; // el conflicto real sigue vigente

    console.log('MISMO id (command_id): ' + sameId + ' (' + beforeCmd.id + ' vs ' + afterCmd.id + ')');
    console.log('MISMO type: ' + sameType);
    console.log('MISMO entity_id: ' + sameEntity);
    console.log('MISMO payload (incluye p_command_id): ' + samePayload);
    console.log('  payload antes: ' + JSON.stringify(beforeCmd.payload));
    console.log('  payload después: ' + JSON.stringify(afterCmd.payload));
    console.log('MISMO created_at (no se recreó el registro): ' + sameCreatedAt);
    console.log('Status terminó en "conflicto" de nuevo (la causa real seguía vigente, correcto): ' + statusWentThroughPendingBackToConflicto);

    const ok = sameId && sameType && sameEntity && samePayload && sameCreatedAt && statusWentThroughPendingBackToConflicto;
    console.log('E2E RETRY PRESERVA EL MISMO REGISTRO: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
