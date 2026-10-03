import { NextRequest, NextResponse } from 'next/server';
import { launchReportBrowser } from '@/lib/reportBrowser';
import { generateReportHtml } from '@/components/reports/ActivityReportTemplate';
import { wrapReportHtml } from '@/lib/reportFontHelper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  console.log('Received request for Activity Report');
  let browser: any = null;
  try {
    const { item, columns, evidence } = await req.json();
    console.log('Payload parsed:', { itemName: item?.name, evidenceCount: evidence?.length });

    if (!item) {
      return NextResponse.json({ error: 'Item data is required' }, { status: 400 });
    }

    // Generate component HTML string directly
    const componentHtml = generateReportHtml(item, columns, evidence);

    const fullHtml = wrapReportHtml({
      title: `Reporte de Actividad - ${item.name}`,
      bodyContent: componentHtml,
      customStyles: `
        body {
          color: #1e293b;
          margin: 0;
          padding: 0;
        }
      `,
    });

    // Launch browser
    browser = await launchReportBrowser();

    const page = await browser.newPage();
    
    // Set content and wait for fonts ready
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
    await page.evaluateHandle('document.fonts.ready');

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
      },
    });

    // Return PDF response
    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Reporte-${item.name.replace(/\s+/g, '_')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
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
