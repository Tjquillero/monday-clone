import { NextRequest, NextResponse } from 'next/server';
import { launchReportBrowser } from '@/lib/reportBrowser';
import { generateActaReportHtml } from '@/components/reports/ActaReportTemplate';
import { wrapReportHtml } from '@/lib/reportFontHelper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let browser: any = null;
  try {
    const { acta, tableData } = await req.json();

    if (!acta || !tableData) {
      return NextResponse.json({ error: 'Acta and table data are required' }, { status: 400 });
    }

    // Generate component HTML string
    const componentHtml = generateActaReportHtml(acta, tableData);

    // Full HTML document with local versioned IBM Plex fonts
    const fullHtml = wrapReportHtml({
      title: `Acta - ${acta.name}`,
      bodyContent: componentHtml,
      customStyles: `
        body {
          color: #0f172a;
          margin: 0;
          padding: 0;
        }
      `,
    });

    // Launch Browser
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
      landscape: true, // Landscape for wide table
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
      },
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Acta_${acta.name}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating PDF:', error);
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
