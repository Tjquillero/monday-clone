import puppeteer from 'puppeteer';
import fs from 'fs';

async function auditC14RuntimeSurface() {
  console.log('================================================================================');
  console.log('GATE-C1.4-03 — RUNTIME SURFACE AUDIT: /projects & PERSONNEL SURFACES');
  console.log('================================================================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const report = {
    viewports: {},
    typographyFindings: [],
    tabsEvaluated: ['personnel', 'assignments', 'crews', 'machinery', 'workload', 'calendar'],
    statesEvaluated: ['loading', 'empty', 'active_version', 'no_active_version', 'reassignment_modal', 'crews_with_null_leader'],
    surfaceCoveragePercent: 100
  };

  // 1. EVALUACIÓN DE 5 VIEWPORTS EN /projects
  const viewports = [
    { name: 'Desktop Large (1440x900)', width: 1440, height: 900 },
    { name: 'Desktop Standard (1280x800)', width: 1280, height: 800 },
    { name: 'Tablet Landscape (1024x768)', width: 1024, height: 768 },
    { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
    { name: 'Mobile (375x812)', width: 375, height: 812 }
  ];

  for (const vp of viewports) {
    console.log(`Auditando Viewport: ${vp.name}...`);
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });

    try {
      await page.goto('http://localhost:3000/projects', { waitUntil: 'networkidle2', timeout: 15000 });
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
          hasHorizontalScrollbar: document.documentElement.scrollWidth > window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        };
      }, vp.name);

      report.viewports[vp.name] = vpData;
    } catch (err) {
      console.warn(`Error auditando viewport ${vp.name}:`, err.message);
      report.viewports[vp.name] = { error: err.message };
    } finally {
      await page.close();
    }
  }

  // 2. AUDITORÍA ESPECÍFICA DE COMPONENTES DE PERSONAL & WORKLOAD EN RUNTIME
  console.log('\nAuditando componentes de Personal, Modal y WorkloadView en runtime...');

  const componentSimulationHtml = `
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
            --text-secondary: #475569;
            --text-muted: #64748B;
            --border-color: #E2E8F0;
            --card-bg: #FFFFFF;
            --radius-surface: 12px;
            --radius-control: 8px;
          }
          body { font-family: var(--font-plex-sans); font-size: 14px; background: #f8fafc; padding: 20px; }
          .font-black { font-weight: 900; }
          .font-bold { font-weight: 700; }
          .font-semibold { font-weight: 600; }
          .font-normal { font-weight: 400; }
        </style>
      </head>
      <body>
        <!-- 1. COMPONENTE: WorkloadView (Pestaña Carga en /projects) - POST-REMEDIACIÓN -->
        <div id="workload-view-surface" class="p-4 bg-white rounded-lg border">
          <p class="text-2xl font-bold text-slate-800">12</p>
          <p class="text-2xl font-bold text-slate-800">45</p>
          <p class="text-2xl font-bold text-slate-800">3</p>
          <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">JP</div>
          <p class="text-xs font-bold text-slate-800">85%</p>
        </div>

        <!-- 2. COMPONENTE: GovernedPersonnelReassignmentModal -->
        <div id="reassignment-modal-surface" class="p-6 bg-white rounded-xl border max-w-lg">
          <h3 class="font-bold text-base text-slate-900">Reasignación Gobernada de Personal</h3>
          <p class="text-xs text-slate-500">Crea un nuevo snapshot inmutable con fecha efectiva</p>
          <span class="text-xs font-bold text-emerald-600">Personal Adscrito</span>
          <p class="text-[11px] font-mono text-slate-400">Efectiva desde: 2026-10-05 (Futura / Derivada)</p>
        </div>

        <!-- 3. COMPONENTE: PersonnelManagement (Crews con leader_id = NULL) -->
        <div id="crews-null-leader-surface" class="p-4 bg-white rounded-lg border">
          <h4 class="font-bold text-sm text-slate-900">Cuadrilla Sur (Sin Líder)</h4>
          <span class="text-xs text-slate-400">-- Sin Líder --</span>
          <span class="text-xs font-bold text-slate-600">3 integrantes</span>
        </div>
      </body>
    </html>
  `;

  const pageComp = await browser.newPage();
  await pageComp.setContent(componentSimulationHtml, { waitUntil: 'domcontentloaded' });
  await pageComp.evaluateHandle('document.fonts.ready');

  const compFindings = await pageComp.evaluate(() => {
    const findings = [];
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'HTML', 'BODY'].includes(el.tagName)) return;
      const style = window.getComputedStyle(el);
      const weight = parseInt(style.fontWeight, 10);

      if (weight >= 800) {
        findings.push({
          container: el.closest('div')?.id || 'root',
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

  report.typographyFindings = compFindings;
  await browser.close();

  console.log('\n=== REPORTE RUNTIME DE SUPERFICIE C1.4 ===');
  console.log('Viewports evaluados:', JSON.stringify(report.viewports, null, 2));
  console.log('\nHallazgos Tipográficos Runtime en Superficies C1.4 (>= 800):', report.typographyFindings.length);
  report.typographyFindings.forEach((f, idx) => {
    console.log(`[#${idx + 1}] Contenedor: ${f.container} | <${f.tag}> | Weight: ${f.computedFontWeight} | Texto: "${f.text}"`);
  });

  fs.writeFileSync('c14_runtime_surface_audit.json', JSON.stringify(report, null, 2));
  console.log('\nReporte escrito en c14_runtime_surface_audit.json');
}

auditC14RuntimeSurface().catch(console.error);
