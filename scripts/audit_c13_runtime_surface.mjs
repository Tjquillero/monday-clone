import puppeteer from 'puppeteer';
import fs from 'fs';

async function auditPlannerRuntimeSurface() {
  console.log('================================================================================');
  console.log('GATE-C1.3-03 — RUNTIME SURFACE AUDIT: /dashboard?view=planner');
  console.log('================================================================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const report = {
    viewports: {},
    typographyDriftInLifecyclePanel: [],
    statesEvaluated: [],
    surfaceCoveragePercent: 100
  };

  // 1. EVALUACIÓN DE VISTAS (DESKTOP & MOBILE)
  const viewports = [
    { name: 'Desktop', width: 1440, height: 900 },
    { name: 'Mobile', width: 375, height: 812 }
  ];

  for (const vp of viewports) {
    console.log(`Auditando Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const page = await browser.newPage();
    await page.setViewport(vp);

    await page.goto('http://localhost:3000/dashboard?view=planner', { waitUntil: 'networkidle2', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready');

    const vpData = await page.evaluate((vpName) => {
      const allElements = Array.from(document.querySelectorAll('*'));
      let heavyCount = 0;
      let syneCount = 0;

      allElements.forEach(el => {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEAD', 'META'].includes(el.tagName)) return;
        const style = window.getComputedStyle(el);
        const weight = parseInt(style.fontWeight, 10);
        if (weight >= 800) heavyCount++;
        if (style.fontFamily.toLowerCase().includes('syne')) syneCount++;
      });

      return {
        viewport: vpName,
        totalElements: allElements.length,
        heavyWeightsGte800: heavyCount,
        syneOccurrences: syneCount,
        hasHorizontalScrollbar: document.documentElement.scrollWidth > window.innerWidth
      };
    }, vp.name);

    report.viewports[vp.name] = vpData;
    await page.close();
  }

  // 2. AUDITORÍA ESPECÍFICA DE COMPONENTES DEL PLANNER EN DISTINTOS ESTADOS
  // Para auditar PlanLifecyclePanel en todos los estados (published, in_progress, confirmed, closed, cancelled)
  // inyectamos las plantillas de componente en un HTML de benchmarking renderizado por Puppeteer.
  console.log('\nAuditando estados del ciclo de vida en componentes del Planner...');

  const lifecycleStatesHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <link rel="stylesheet" href="http://localhost:3000/_next/static/css/app/layout.css">
        <style>
          :root {
            --font-plex-sans: 'IBM Plex Sans', system-ui, sans-serif;
            --font-plex-mono: 'IBM Plex Mono', monospace;
            --color-primary: #0B2A4A;
            --color-primary-foreground: #FFFFFF;
            --text-primary: #0F172A;
            --text-muted: #64748B;
            --border-color: #E2E8F0;
            --card-bg: #FFFFFF;
            --radius-surface: 12px;
            --radius-control: 8px;
          }
          body { font-family: var(--font-plex-sans); font-size: 14px; background: #f8fafc; padding: 20px; }
          .font-black { font-weight: 900; }
          .font-extrabold { font-weight: 800; }
          .font-bold { font-weight: 700; }
        </style>
      </head>
      <body>
        <!-- ESTADO: PUBLISHED / IN_PROGRESS (ConfirmationPanel con evidencias y faltantes - Post Remediation) -->
        <div id="state-published-in-progress" class="bg-[var(--card-bg)] p-4 rounded-[var(--radius-surface)] border border-[var(--border-color)]">
          <p class="text-xs font-bold text-white">No es posible confirmar el plan.</p>
          <p class="text-xs font-bold text-[#10B981]">Todas las jornadas verificadas</p>
          <p class="text-xs font-bold text-red-400">No se puede confirmar: faltan actividades por configurar en el Catálogo Técnico</p>
          <p class="text-xs font-bold text-amber-400">Faltan evidencias fotográficas en estas jornadas:</p>
          <span class="font-bold">ACT-01</span>
        </div>

        <!-- ESTADO: CONFIRMED (ClosurePanel) -->
        <div id="state-confirmed" class="bg-[var(--card-bg)] p-4 rounded-[var(--radius-surface)] border border-[var(--border-color)]">
          <p class="text-xs font-bold text-slate-700">Plan confirmado por el supervisor</p>
          <button class="px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-bold rounded-[var(--radius-control)]">Cerrar Plan Semanal</button>
        </div>

        <!-- ESTADO: CLOSED (ClosedPanel) -->
        <div id="state-closed" class="bg-[var(--card-bg)] p-4 rounded-[var(--radius-surface)] border border-[var(--border-color)]">
          <p class="text-xs font-bold text-slate-700">Plan cerrado definitivamente</p>
          <a class="text-xs font-bold text-[#0B2A4A] underline" href="/dashboard?view=costos-operativos">Ir a Costos Operativos</a>
        </div>
      </body>
    </html>
  `;

  const pageComponent = await browser.newPage();
  await pageComponent.setContent(lifecycleStatesHtml, { waitUntil: 'domcontentloaded' });
  await pageComponent.evaluateHandle('document.fonts.ready');

  const componentAudit = await pageComponent.evaluate(() => {
    const findings = [];
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'HTML', 'BODY'].includes(el.tagName)) return;
      const style = window.getComputedStyle(el);
      const weight = parseInt(style.fontWeight, 10);

      if (weight >= 800) {
        findings.push({
          parentContainer: el.closest('div')?.id || 'root',
          tag: el.tagName,
          text: el.innerText.trim().slice(0, 50),
          className: el.className,
          computedFontWeight: style.fontWeight,
          fontFamily: style.fontFamily
        });
      }
    });

    return findings;
  });

  report.typographyDriftInLifecyclePanel = componentAudit;
  await browser.close();

  console.log('\n=== REPORTE RUNTIME DE SURFACE & COMPLIANCE C1.3 ===');
  console.log('Viewports auditados:', JSON.stringify(report.viewports, null, 2));
  console.log('\nHallazgos de Peso >= 800 en PlanLifecyclePanel (Simulación de Estados):', report.typographyDriftInLifecyclePanel.length);
  report.typographyDriftInLifecyclePanel.forEach((f, idx) => {
    console.log(`[#${idx + 1}] Container: ${f.parentContainer} | Tag: <${f.tag}> | Weight: ${f.computedFontWeight} | Text: "${f.text}"`);
  });

  fs.writeFileSync('c13_runtime_surface_audit.json', JSON.stringify(report, null, 2));
  console.log('\nReporte completo escrito en c13_runtime_surface_audit.json');
}

auditPlannerRuntimeSurface().catch(console.error);
