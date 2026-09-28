import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testReportGeneration() {
  console.log('Testing Puppeteer local font rendering under CONDITION-02...');

  // 1. Read local font base64
  const fontsDir = path.resolve(process.cwd(), 'public/fonts/ibm-plex');
  const sansReg = fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Regular.ttf')).toString('base64');
  const sansBold = fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Bold.ttf')).toString('base64');
  const monoReg = fs.readFileSync(path.join(fontsDir, 'IBMPlexMono-Regular.ttf')).toString('base64');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Reporte Test Puppeteer CONDITION-02</title>
      <style>
        @font-face {
          font-family: 'IBM Plex Sans';
          font-style: normal;
          font-weight: 400;
          src: url(data:font/truetype;charset=utf-8;base64,${sansReg}) format('truetype');
        }
        @font-face {
          font-family: 'IBM Plex Sans';
          font-style: normal;
          font-weight: 700;
          src: url(data:font/truetype;charset=utf-8;base64,${sansBold}) format('truetype');
        }
        @font-face {
          font-family: 'IBM Plex Mono';
          font-style: normal;
          font-weight: 400;
          src: url(data:font/truetype;charset=utf-8;base64,${monoReg}) format('truetype');
        }

        body {
          font-family: 'IBM Plex Sans', sans-serif;
          color: #0f172a;
          margin: 40px;
          background: #ffffff;
        }

        h1 {
          font-size: 28px;
          font-weight: 700;
          color: #0B2A4A;
        }

        .code-block {
          font-family: 'IBM Plex Mono', monospace;
          background: #F0F2F0;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 14px;
        }

        .tabular {
          font-variant-numeric: tabular-nums;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <h1>MANTENIX — Reporte de Verificación de Tipografía Puppeteer</h1>
      <p>Este documento valida la carga 100% offline de <strong>IBM Plex Sans</strong> e <strong>IBM Plex Mono</strong> bajo <code>CONDITION-02</code>.</p>

      <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr style="background: #0B2A4A; color: white;">
          <th>Ítem</th>
          <th>Código (Mono)</th>
          <th>Descripción (Sans)</th>
          <th>Monto (Tabular Nums)</th>
        </tr>
        <tr>
          <td>01</td>
          <td class="code-block">ACT-2026-001</td>
          <td>Mantenimiento preventivo de subestación eléctrica</td>
          <td class="tabular" style="text-align: right;">$ 14.850.000,00</td>
        </tr>
        <tr>
          <td>02</td>
          <td class="code-block">ACT-2026-002</td>
          <td>Inspección termográfica de tableros de distribución</td>
          <td class="tabular" style="text-align: right;">$ 3.240.000,00</td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Set content completely offline
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.evaluateHandle('document.fonts.ready');

  // Verify font loaded status in browser DOM
  const fontStatus = await page.evaluate(() => {
    const fonts = Array.from(document.fonts).map(f => ({
      family: f.family,
      status: f.status,
      weight: f.weight
    }));
    return {
      totalFonts: fonts.length,
      fonts,
      ready: document.fonts.status === 'loaded'
    };
  });

  console.log('Font loading verification in Puppeteer:', JSON.stringify(fontStatus, null, 2));

  const outDir = path.resolve(process.cwd(), 'brand-assets/previews');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const pdfPath = path.join(outDir, 'puppeteer_condition02_test.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
  });

  console.log(`PDF successfully generated at: ${pdfPath}`);
  await browser.close();
}

testReportGeneration().catch(err => {
  console.error('Error testing report generation:', err);
  process.exit(1);
});
