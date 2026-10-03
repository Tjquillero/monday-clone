import { NextRequest, NextResponse } from 'next/server';
import { launchReportBrowser } from '@/lib/reportBrowser';
import { generateBoardReportHtml } from '@/components/reports/BoardReportTemplate';
import { wrapReportHtml } from '@/lib/reportFontHelper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  console.log('Received request for Board Report');
  let browser: any = null;
  try {
    const { boardName, groups, columns } = await req.json();
    console.log('Payload parsed:', { boardName, groupsCount: groups?.length });

    if (!groups || !columns) {
      return NextResponse.json({ error: 'Board data is required' }, { status: 400 });
    }

    // Generate HTML string directly
    const componentHtml = generateBoardReportHtml(boardName || 'Tablero', groups, columns);

    // Full HTML document with local versioned IBM Plex fonts
    const fullHtml = wrapReportHtml({
      title: `Reporte de Tablero - ${boardName || 'Mantenix'}`,
      bodyContent: componentHtml,
    });

    // Launch browser
    browser = await launchReportBrowser();

    const page = await browser.newPage();
    
    // Set content and wait for DOM and local fonts ready
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
        'Content-Disposition': `attachment; filename="Reporte_Sitio_${(boardName || 'Board').replace(/\s+/g, '_')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Board PDF Generation Error:', error);
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
