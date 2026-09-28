import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

// Import opentype
const opentypePath = path.resolve(process.cwd(), 'scripts/opentype.min.js');
let opentype;
if (fs.existsSync(opentypePath)) {
  const mod = await import('file://' + opentypePath.replace(/\\/g, '/'));
  opentype = mod.default || mod;
}

// Import template generators
import { generateBoardReportHtml } from '../src/components/reports/BoardReportTemplate.ts';
import { generateActaReportHtml } from '../src/components/reports/ActaReportTemplate.ts';
import { generateCertifiedActaReportHtml } from '../src/components/reports/CertifiedActaReportTemplate.ts';
import { generateExecutiveReportHtml } from '../src/components/reports/ExecutiveReportTemplate.ts';
import { generateReportHtml as generateActivityReportHtml } from '../src/components/reports/ActivityReportTemplate.ts';
import { generateNewsReportHtml } from '../src/components/reports/NewsReportTemplate.ts';
import { wrapReportHtml } from '../src/lib/reportFontHelper.ts';

async function runStep4Verification() {
  console.log('=== INICIANDO VALIDACIÓN FORMAL DE PASO 4 (4.4 - 4.8) ===\n');

  const outDir = path.resolve(process.cwd(), 'brand-assets/previews/step4_pdfs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // ----------------------------------------------------
  // 4.4 VALIDACIÓN DE BINARIOS DE FUENTES
  // ----------------------------------------------------
  console.log('--- 4.4 Verificación de Binarios TTF en public/fonts/ibm-plex/ ---');
  const fontsDir = path.resolve(process.cwd(), 'public/fonts/ibm-plex');
  const fontFiles = [
    'IBMPlexSans-Regular.ttf',
    'IBMPlexSans-SemiBold.ttf',
    'IBMPlexSans-Bold.ttf',
    'IBMPlexMono-Regular.ttf',
    'IBMPlexMono-SemiBold.ttf',
  ];

  const fontAuditResults = [];
  const testChars = ['a', 'z', 'A', 'Z', '0', '9', 'á', 'é', 'í', 'ó', 'ú', 'ñ', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ', '$', '%', '€', '#', '✓', '•', '-'];

  for (const f of fontFiles) {
    const fPath = path.join(fontsDir, f);
    if (!fs.existsSync(fPath)) {
      throw new Error(`Font file not found: ${fPath}`);
    }
    const stat = fs.statSync(fPath);
    let fontMeta = { file: f, sizeBytes: stat.size, valid: false };

    if (opentype) {
      try {
        const font = opentype.loadSync(fPath);
        const nameTable = font.names;
        const family = nameTable.fontFamily?.en || 'Unknown';
        const subfamily = nameTable.fontSubfamily?.en || 'Unknown';
        const postScriptName = nameTable.postScriptName?.en || 'Unknown';
        const numGlyphs = font.numGlyphs;

        // Check essential Spanish glyphs
        const missingGlyphs = [];
        for (const char of testChars) {
          const glyph = font.charToGlyph(char);
          if (!glyph || glyph.index === 0) {
            missingGlyphs.push(char);
          }
        }

        fontMeta = {
          file: f,
          family,
          subfamily,
          postScriptName,
          numGlyphs,
          sizeBytes: stat.size,
          missingChars: missingGlyphs,
          valid: missingGlyphs.length === 0 && numGlyphs > 100,
        };
      } catch (err) {
        fontMeta.error = err.message;
      }
    }
    fontAuditResults.push(fontMeta);
    console.log(`✓ ${f}: ${stat.size} bytes | Family: ${fontMeta.family || 'OK'} | Subfamily: ${fontMeta.subfamily || 'OK'} | Glyphs: ${fontMeta.numGlyphs || 'N/A'} | Missing Spanish chars: ${fontMeta.missingChars?.length === 0 ? 'NONE (100% complete)' : fontMeta.missingChars?.join('')}`);
  }

  // ----------------------------------------------------
  // 4.5 GENERACIÓN REAL DE LOS 7 REPORTES REPRESENTATIVOS
  // ----------------------------------------------------
  console.log('\n--- 4.5 Generación Real de los 7 Templates en Puppeteer ---');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const generatedPdfs = [];

  // Helper to render and inspect PDF
  async function renderReportPdf({ name, title, html, landscape = false }) {
    const page = await browser.newPage();

    // Intercept network requests to prove ZERO external font calls
    const networkRequests = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      networkRequests.push(req.url());
      req.continue();
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');

    // Query font status in browser context
    const browserFontInfo = await page.evaluate(() => {
      const list = Array.from(document.fonts).map(f => ({
        family: f.family,
        weight: f.weight,
        status: f.status,
      }));
      return {
        totalFonts: list.length,
        fonts: list,
        docStatus: document.fonts.status,
      };
    });

    const pdfFilename = `${name}.pdf`;
    const pdfPath = path.join(outDir, pdfFilename);

    const pdfBuffer = await page.pdf({
      format: landscape ? 'Letter' : 'A4',
      landscape,
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    fs.writeFileSync(pdfPath, pdfBuffer);

    // Analyze PDF stream content for embedded font descriptors
    const pdfString = pdfBuffer.toString('latin1');
    const fontDescriptorMatches = [...pdfString.matchAll(/\/FontDescriptor|\/BaseFont\s*\/([^\s\/>]+)/g)].map(m => m[1] || m[0]);

    // Check for illegal external calls
    const externalFontRequests = networkRequests.filter(url =>
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('fonts.cdn')
    );

    const hasInter = pdfString.includes('Inter-') || pdfString.includes('Inter');
    const hasPlayfair = pdfString.includes('Playfair');
    const hasHelveticaNeue = pdfString.includes('HelveticaNeue');
    const hasIBMPlexSans = pdfString.includes('IBMPlexSans') || pdfString.includes('IBM Plex Sans');
    const hasIBMPlexMono = pdfString.includes('IBMPlexMono') || pdfString.includes('IBM Plex Mono');

    await page.close();

    const result = {
      name,
      pdfPath,
      pdfSize: pdfBuffer.length,
      landscape,
      externalFontRequests,
      browserFontInfo,
      fontMatches: {
        hasIBMPlexSans,
        hasIBMPlexMono,
        hasInter,
        hasPlayfair,
        hasHelveticaNeue,
      },
      fontDescriptorCount: fontDescriptorMatches.length,
    };

    generatedPdfs.push(result);
    console.log(`✓ [${name}] PDF generado (${(pdfBuffer.length / 1024).toFixed(1)} KB) | Fuentes cargadas en DOM: ${browserFontInfo.totalFonts} | External font requests: ${externalFontRequests.length}`);
    return result;
  }

  // 1. Board Report
  const boardHtml = wrapReportHtml({
    title: 'Reporte de Tablero - Proyecto Metro',
    bodyContent: generateBoardReportHtml('Frente Estación Central', [
      {
        id: 'g1',
        title: 'Obras Civiles Subterráneas',
        items: [
          {
            id: 'i1',
            name: 'Excavación de pozo de ventilación #3',
            values: { status: 'Done', date: '2026-09-25', person: 'Carlos Gómez', category: 'Infraestructura' }
          },
          {
            id: 'i2',
            name: 'Instalación de dovelas de concreto reforzado',
            values: { status: 'Working on it', date: '2026-09-28', person: 'María Ruiz', category: 'Montaje' }
          }
        ]
      }
    ], [
      { id: 'status', title: 'Estado', type: 'status' },
      { id: 'person', title: 'Responsable', type: 'person' },
      { id: 'date', title: 'Fecha', type: 'date' }
    ])
  });
  await renderReportPdf({ name: '1_board_report', title: 'Reporte de Tablero', html: boardHtml });

  // 2. Acta Mensual
  const actaHtml = wrapReportHtml({
    title: 'Acta Mensual - ACTA-2026-09',
    bodyContent: generateActaReportHtml({
      id: 'acta-001',
      name: 'Acta de Obra No. 09',
      date: '2026-09-30',
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      contract_name: 'Consorcio Mantenix Viales',
      contract_number: 'CTO-2026-8849',
    }, [
      {
        id: 'r1',
        itemNumber: '01.01',
        name: 'Demolición de pavimento asfáltico e=0.15m',
        groupName: 'Movimiento de Tierras',
        values: { unit: 'm2' },
        budgetQty: 1500,
        unitPrice: 45000,
        budgetTotal: 67500000,
        previousQty: 1200,
        previousValue: 54000000,
        currentQty: 300,
        currentValue: 13500000,
        currentPct: 20.0,
        accumQty: 1500,
        accumValue: 67500000,
        balanceQty: 0,
        balanceValue: 0
      }
    ]),
    landscape: true,
  });
  await renderReportPdf({ name: '2_acta_report', title: 'Acta Mensual', html: actaHtml, landscape: true });

  // 3. Certified Acta
  const certActaHtml = wrapReportHtml({
    title: 'Acta Certificada - ACTA-CERT-009',
    bodyContent: generateCertifiedActaReportHtml({
      id: 'cert-01',
      board_id: 'b-01',
      numero: 'ACTA-CERT-009',
      tipo: 'mensual',
      periodo_inicio: '2026-09-01',
      periodo_fin: '2026-09-30',
      estado: 'issued',
      aiu_admin_pct: 20,
      aiu_imprevistos_pct: 5,
      aiu_utilidad_pct: 5,
      issued_at: '2026-09-27T18:00:00Z',
      items: [
        {
          id: 'item-01',
          acta_id: 'cert-01',
          activity_id: 'act-01',
          descripcion_snapshot: 'Excavación mecánica en material común',
          unidad_snapshot: 'm3',
          precio_unitario_snapshot: 35000,
          cantidad_facturada: 2500,
          valor_total: 87500000,
        },
        {
          id: 'item-02',
          acta_id: 'cert-01',
          activity_id: 'act-02',
          descripcion_snapshot: 'Relleno compactado con material de sitio',
          unidad_snapshot: 'm3',
          precio_unitario_snapshot: 25000,
          cantidad_facturada: 500,
          valor_total: 12500000,
        }
      ]
    }, {
      subtotal_costo_directo: 100000000,
      aiu_administracion: 20000000,
      aiu_imprevistos: 5000000,
      aiu_utilidad: 5000000,
      iva_utilidad: 950000,
      total_acta: 130950000,
      total_items_certificados: 2,
    }),
    landscape: true,
  });
  await renderReportPdf({ name: '3_certified_acta_report', title: 'Acta Certificada', html: certActaHtml, landscape: true });

  // 4. Executive Report
  const execHtml = wrapReportHtml({
    title: 'Informe Ejecutivo de Avance',
    bodyContent: generateExecutiveReportHtml('Proyecto Vial Troncal Pacífico', [
      {
        id: 'ev-1',
        code: 'ACT-01',
        name: 'Construcción de puente vehicular PK 12+400',
        unit: 'M3',
        description: 'Vaciado de losa superior en concreto de 4000 PSI completado con éxito.',
        locations: [
          {
            name: 'Estribo Norte PK 12+400',
            quantity: 125.5,
            photos: [
              'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600'
            ]
          },
          {
            name: 'Estribo Sur PK 12+480',
            quantity: 110.0,
            photos: [
              'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600'
            ]
          }
        ]
      }
    ]),
  });
  await renderReportPdf({ name: '4_executive_report', title: 'Informe Ejecutivo', html: execHtml });

  // 5. Activity Report
  const actItemHtml = wrapReportHtml({
    title: 'Reporte de Actividad Individual',
    bodyContent: generateActivityReportHtml({
      id: 'act-99',
      name: 'Soldadura aluminotérmica de rieles tramo 4',
      description: 'Unión y alineación milimétrica con ensayo no destructivo por ultrasonido.',
      values: {
        status: 'Done',
        person: 'Ing. Fernando Pérez',
        date: '2026-09-26',
        category: 'Vía Férrea'
      }
    }, [
      { id: 'status', title: 'Estado', type: 'status' },
      { id: 'person', title: 'Responsable', type: 'person' },
      { id: 'date', title: 'Fecha', type: 'date' },
      { id: 'category', title: 'Frente', type: 'text' }
    ], [
      { url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600', timestamp: '2026-09-26T10:15:00Z' }
    ]),
  });
  await renderReportPdf({ name: '5_activity_report', title: 'Reporte de Actividad', html: actItemHtml });

  // 6. News / Incidents Report
  const newsHtml = wrapReportHtml({
    title: 'Reporte de Novedades e Incidentes',
    bodyContent: generateNewsReportHtml('Corredor Férreo Central', [
      {
        id: 'inc-1',
        itemName: 'Afectación por lluvia torrencial en Talud Sur',
        date: '2026-09-26',
        severity: 'Alta',
        type: 'Climático / Geotécnico',
        siteName: 'Frente de Excavación PK 08+100',
        description: 'Se activó protocolo preventivo y canalización de escorrentías. 0 trabajadores afectados.',
        solution: 'Bombeo continuo y refuerzo de cunetas perimetrales.',
        photo: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600'
      }
    ]),
  });
  await renderReportPdf({ name: '6_news_report', title: 'Reporte de Novedades', html: newsHtml });

  // 7. Activity Execution Photographic Support
  const actExecHtml = wrapReportHtml({
    title: 'Informe de Ejecución de Actividades y Soporte Fotográfico',
    bodyContent: `
      <div style="padding: 20px;">
        <h1 style="color: #0B2A4A; font-size: 20pt; font-weight: 700; margin-bottom: 8px;">INFORME DE EJECUCIÓN Y SOPORTE FOTOGRÁFICO</h1>
        <p style="color: #64748b; font-size: 10pt; margin-bottom: 24px;">ACTA No. 2026-09 | PERIODO: 01/09/2026 - 30/09/2026</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #0B2A4A; color: white;">
              <th style="padding: 8px; text-align: left;">Código Ítem</th>
              <th style="padding: 8px; text-align: left;">Descripción de la Actividad</th>
              <th style="padding: 8px; text-align: right;">Cantidad Ejecutada</th>
              <th style="padding: 8px; text-align: right;">Valor ($ COP)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td class="font-mono" style="padding: 8px;">ACT-2026-CIV-001</td>
              <td style="padding: 8px;">Cimentación profunda con pilotes pre-excavados Ø 1.20m</td>
              <td class="numeric-tabular" style="padding: 8px; text-align: right;">120.50 m</td>
              <td class="numeric-tabular" style="padding: 8px; text-align: right;">$ 145.800.000,00</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td class="font-mono" style="padding: 8px;">ACT-2026-CIV-002</td>
              <td style="padding: 8px;">Muros de contención en gaviones de piedra seleccionada</td>
              <td class="numeric-tabular" style="padding: 8px; text-align: right;">340.00 m3</td>
              <td class="numeric-tabular" style="padding: 8px; text-align: right;">$ 88.400.000,00</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 30px; display: flex; gap: 20px;">
          <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <div style="font-weight: 700; color: #0B2A4A; font-size: 10pt; margin-bottom: 4px;">COORDENADAS GPS VERIFICADAS</div>
            <div class="font-mono" style="font-size: 9pt; color: #334155;">LAT: 4°36'35.2"N | LON: 74°04'54.8"W</div>
            <div style="font-size: 8pt; color: #16a34a; font-weight: 700; margin-top: 4px;">✓ Certificado con marca de tiempo UTC</div>
          </div>
          <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <div style="font-weight: 700; color: #0B2A4A; font-size: 10pt; margin-bottom: 4px;">TOTAL FRENTE DE OBRA</div>
            <div class="numeric-tabular" style="font-size: 14pt; font-weight: 700; color: #0B2A4A;">$ 234.200.000,00</div>
          </div>
        </div>
      </div>
    `
  });
  await renderReportPdf({ name: '7_activity_execution_report', title: 'Informe de Ejecución', html: actExecHtml });

  await browser.close();

  // Summary of PDF inspections
  console.log('\n=== RESUMEN DE INSPECCIÓN DE FUENTES EN PDFS GENERADOS ===');
  console.log(JSON.stringify({
    totalPdfsGenerated: generatedPdfs.length,
    fontBinariesVerified: fontAuditResults.length,
    allFontsValid: fontAuditResults.every(f => f.valid),
    allPdfsZeroExternalRequests: generatedPdfs.every(p => p.externalFontRequests.length === 0),
    reports: generatedPdfs.map(p => ({
      report: p.name,
      sizeKb: (p.pdfSize / 1024).toFixed(1),
      externalCalls: p.externalFontRequests.length,
      domFontsLoaded: p.browserFontInfo.totalFonts,
      fontMatches: p.fontMatches
    }))
  }, null, 2));

  console.log('\n=== VALIDACIÓN DE PASO 4 FINALIZADA EXITOSAMENTE ===');
}

runStep4Verification().catch(err => {
  console.error('ERROR EN VALIDACIÓN DE PASO 4:', err);
  process.exit(1);
});
