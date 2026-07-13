import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateCertifiedActaReportHtml } from '@/components/reports/CertifiedActaReportTemplate';
import { CertifiedActa, CertifiedActaTotals } from '@/types/monday';

// Renderiza el PDF de un acta certificada YA emitida. No recalcula nada —
// acta/totals llegan resueltos por el cliente (que ya los tiene vía RLS/RPC,
// mismo patrón que /api/reports/acta). Esta ruta solo formatea + Puppeteer.

export async function POST(req: NextRequest) {
  try {
    const { acta, totals } = (await req.json()) as { acta: CertifiedActa; totals: CertifiedActaTotals };

    if (!acta || !totals) {
      return NextResponse.json({ error: 'acta y totals son requeridos' }, { status: 400 });
    }
    if (acta.estado !== 'issued') {
      return NextResponse.json({ error: 'Solo se puede exportar un acta emitida (issued)' }, { status: 400 });
    }

    const componentHtml = generateCertifiedActaReportHtml(acta, totals);

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
            }
          </style>
        </head>
        <body>
          ${componentHtml}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      landscape: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    await browser.close();

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Acta_${acta.numero}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating certified acta PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
