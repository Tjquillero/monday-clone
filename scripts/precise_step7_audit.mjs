import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// 1. ESCANEO TEXTUAL ESTRICTO (SOLO 800/900, EXCLUYENDO BOLD/700)
function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === "node_modules" || file === ".git" || file === ".next" || file === "dist" || file === "coverage" || file === "scratch") continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const strictRegex = /\b(font-black|font-extrabold|font-\[800\]|font-\[900\])\b|font-weight\s*:\s*(800|900)\b|fontWeight\s*[:=]\s*["']?(800|900)["']?/i;

const allFiles = walk(".");
const strictInventory = {
  uiRuntimeFiles: {},
  reportFiles: {},
  svgWordmarkFiles: {},
  totalMatches: 0
};

for (const f of allFiles) {
  const ext = path.extname(f);
  if (![".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".svg"].includes(ext)) continue;
  if (f.includes("scripts/") || f.includes("audit_") || f.includes("inspect_")) continue;

  const content = fs.readFileSync(f, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    if (strictRegex.test(line)) {
      const match = line.match(strictRegex)[0];
      const normPath = f.replace(/\\/g, "/");
      const isSvg = normPath.endsWith(".svg") || normPath.includes("brand-assets") || line.includes("<svg") || line.includes("<path");
      const isReport = normPath.includes("report") || normPath.includes("pdf") || normPath.includes("template");

      const entry = {
        file: normPath,
        line: idx + 1,
        match: match,
        code: line.trim()
      };

      strictInventory.totalMatches++;

      if (isSvg) {
        strictInventory.svgWordmarkFiles[normPath] = (strictInventory.svgWordmarkFiles[normPath] || []);
        strictInventory.svgWordmarkFiles[normPath].push(entry);
      } else if (isReport) {
        strictInventory.reportFiles[normPath] = (strictInventory.reportFiles[normPath] || []);
        strictInventory.reportFiles[normPath].push(entry);
      } else {
        strictInventory.uiRuntimeFiles[normPath] = (strictInventory.uiRuntimeFiles[normPath] || []);
        strictInventory.uiRuntimeFiles[normPath].push(entry);
      }
    }
  });
}

// 2. AUDITORÍA DETALLADA DE RUNTIME (19 ELEMENTOS) CON PUPPETEER
const ROUTES_TO_AUDIT = [
  'http://localhost:3000/login',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/my-work',
  'http://localhost:3000/projects'
];

async function runRuntimeDetailedAudit() {
  console.log('Iniciando introspección profunda de elementos runtime >= 800...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const detailedRuntimeElements = [];

  for (const url of ROUTES_TO_AUDIT) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluateHandle('document.fonts.ready');

      const elements = await page.evaluate((currentUrl) => {
        const results = [];
        const all = document.querySelectorAll('*');

        all.forEach((el, index) => {
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEAD', 'META', 'LINK'].includes(el.tagName)) return;

          const style = window.getComputedStyle(el);
          const weightNum = parseInt(style.fontWeight, 10);

          if (weightNum >= 800) {
            const isPlexSans = style.fontFamily.toLowerCase().includes('plex sans') ||
                               style.fontFamily.toLowerCase().includes('ibm plex');

            // Build a descriptive selector
            let selector = el.tagName.toLowerCase();
            if (el.id) selector += `#${el.id}`;
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.trim().split(/\s+/).slice(0, 3).join('.');
              if (classes) selector += `.${classes}`;
            }

            results.push({
              route: currentUrl.replace('http://localhost:3000', ''),
              selector: selector,
              tag: el.tagName,
              className: typeof el.className === 'string' ? el.className : '',
              textSnippet: el.innerText ? el.innerText.trim().slice(0, 50).replace(/\n/g, ' ') : '',
              computedFontFamily: style.fontFamily,
              computedFontWeight: style.fontWeight,
              isPlexSans
            });
          }
        });

        return results;
      }, url);

      detailedRuntimeElements.push(...elements);
    } catch (err) {
      console.error(`Error en ${url}:`, err.message);
    }
  }

  await browser.close();

  // Guardar resultados
  const finalReport = {
    strictInventory: {
      totalMatches: strictInventory.totalMatches,
      uiRuntimeFilesCount: Object.keys(strictInventory.uiRuntimeFiles).length,
      reportFilesCount: Object.keys(strictInventory.reportFiles).length,
      svgWordmarkFilesCount: Object.keys(strictInventory.svgWordmarkFiles).length,
      uiRuntimeFiles: strictInventory.uiRuntimeFiles,
      reportFiles: strictInventory.reportFiles,
      svgWordmarkFiles: strictInventory.svgWordmarkFiles
    },
    runtimeAudit: {
      totalRuntimeElements: detailedRuntimeElements.length,
      elements: detailedRuntimeElements
    }
  };

  fs.writeFileSync('runtime_drift_precise_step7.json', JSON.stringify(finalReport, null, 2));
  console.log(`Auditoría guardada en runtime_drift_precise_step7.json.`);
  console.log(`Total coincidencias sintácticas estrictas en repo: ${strictInventory.totalMatches}`);
  console.log(`Total elementos runtime computados >= 800: ${detailedRuntimeElements.length}`);
}

runRuntimeDetailedAudit().catch(console.error);
