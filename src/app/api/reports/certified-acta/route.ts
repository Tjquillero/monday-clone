import { NextRequest, NextResponse } from 'next/server';
import { launchReportBrowser } from '@/lib/reportBrowser';
import { generateCertifiedActaReportHtml } from '@/components/reports/CertifiedActaReportTemplate';
import { wrapReportHtml } from '@/lib/reportFontHelper';
import { CertifiedActa, CertifiedActaTotals } from '@/types/monday';

// Renderiza el PDF de un acta certificada YA emitida. No recalcula nada —
// acta/totals llegan resueltos por el cliente (que ya los tiene vía RLS/RPC,
// mismo patrón que /api/reports/acta). Esta ruta solo formatea + Puppeteer.

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let browser: any = null;
  try {
    const { acta, totals } = (await req.json()) as { acta: CertifiedActa; totals: CertifiedActaTotals };

    if (!acta || !totals) {
      return NextResponse.json({ error: 'acta y totals son requeridos' }, { status: 400 });
    }
    if (acta.estado !== 'issued') {
      return NextResponse.json({ error: 'Solo se puede exportar un acta emitida (issued)' }, { status: 400 });
    }

    const componentHtml = generateCertifiedActaReportHtml(acta, totals);

    const fullHtml = wrapReportHtml({
      title: `Acta Certificada - ${acta.numero}`,
      bodyContent: componentHtml,
      customStyles: `
        body {
          color: #0f172a;
          margin: 0;
          padding: 0;
        }
      `,
    });

    browser = await launchReportBrowser();
    const page = await browser.newPage();

    await page.setContent(fullHtml, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      landscape: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Acta_${acta.numero}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating certified acta PDF:', error);
    const isLaunchError = error?.code === 'PDF_BROWSER_LAUNCH_FAILED' || error?.message?.includes('PDF_BROWSER_LAUNCH_FAILED');
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        code: isLaunchError ? 'PDF_BROWSER_LAUNCH_FAILED' : 'PDF_GENERATION_FAILED',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
