import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateBoardReportHtml } from '@/components/reports/BoardReportTemplate';

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

    // Full HTML document with Tailwind CDN
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    primary: '#24614b',
                  }
                }
              }
            }
          </script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            body { 
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact;
            }
            .break-inside-avoid {
              break-inside: avoid;
            }
            table { page-break-inside: auto }
            tr    { page-break-inside: avoid; page-break-after: auto }
            thead { display: table-header-group }
            tfoot { display: table-footer-group }
          </style>
        </head>
        <body>
          ${componentHtml}
        </body>
      </html>
    `;

    // Launch puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    
    // Set content and wait for network idle
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

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
