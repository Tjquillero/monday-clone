import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateBoardReportHtml } from '@/components/reports/BoardReportTemplate';
import { wrapReportHtml } from '@/lib/reportFontHelper';

export async function POST(req: NextRequest) {
  console.log('Received request for Board Report');
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

    // Launch puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

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

    await browser.close();

    // Return PDF response
    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Reporte_Sitio_${(boardName || 'Board').replace(/\s+/g, '_')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Board PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
