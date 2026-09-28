import puppeteer from 'puppeteer';

const ROUTES_TO_AUDIT = [
  'http://localhost:3000/',
  'http://localhost:3000/login',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/my-work',
  'http://localhost:3000/projects',
  'http://localhost:3000/verification',
  'http://localhost:3000/documentos'
];

async function runStep9BrowserAudit() {
  console.log('Iniciando auditoría runtime final STEP 9 con Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const summary = [];

  for (const url of ROUTES_TO_AUDIT) {
    const routeName = url.replace('http://localhost:3000', '') || '/';
    console.log(`Auditando ruta: ${routeName}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluateHandle('document.fonts.ready');

      const data = await page.evaluate((currentRoute) => {
        const all = Array.from(document.querySelectorAll('*'));
        let total = 0;
        let plexSans = 0;
        let plexMono = 0;
        let heavy = 0;
        let syne = 0;
        const unexpectedFonts = new Set();

        all.forEach(el => {
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEAD', 'META', 'LINK'].includes(el.tagName)) return;
          total++;
          const style = window.getComputedStyle(el);
          const family = style.fontFamily.toLowerCase();
          const weight = parseInt(style.fontWeight, 10);

          if (family.includes('syne')) syne++;
          if (family.includes('ibm plex sans') || family.includes('plex sans')) {
            plexSans++;
          } else if (family.includes('ibm plex mono') || family.includes('plex mono')) {
            plexMono++;
          } else if (el.tagName !== 'svg' && el.tagName !== 'path') {
            unexpectedFonts.add(style.fontFamily);
          }

          if (weight >= 800) {
            heavy++;
          }
        });

        const htmlClasses = document.documentElement.className;

        return {
          route: currentRoute,
          totalElements: total,
          ibmPlexSansElements: plexSans,
          ibmPlexMonoElements: plexMono,
          computedWeightGte800: heavy,
          syneOccurrences: syne,
          hasFontSyneVar: htmlClasses.includes('--font-syne'),
          unexpectedFonts: Array.from(unexpectedFonts)
        };
      }, routeName);

      summary.push(data);
    } catch (err) {
      console.error(`Error auditando ${routeName}:`, err.message);
    }
  }

  await browser.close();

  console.log('\n========================================================================================');
  console.log('                       STEP 9: MATRIZ RUNTIME INTEGRAL FINAL                             ');
  console.log('========================================================================================');
  console.table(summary.map(s => ({
    Ruta: s.route,
    Total: s.totalElements,
    'IBM Plex Sans': s.ibmPlexSansElements,
    'IBM Plex Mono': s.ibmPlexMonoElements,
    'Weight >=800': s.computedWeightGte800,
    'Syne': s.syneOccurrences,
    '--font-syne': s.hasFontSyneVar ? 'SÍ' : 'NO'
  })));
  console.log('========================================================================================\n');
}

runStep9BrowserAudit().catch(console.error);
