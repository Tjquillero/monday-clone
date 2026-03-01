import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateReportHtml } from '@/components/reports/ActivityReportTemplate';

export async function POST(req: NextRequest) {
  console.log('Received request for Activity Report');
  try {
    const { item, columns, evidence } = await req.json();
    console.log('Payload parsed:', { itemName: item?.name, evidenceCount: evidence?.length });

    if (!item) {
      return NextResponse.json({ error: 'Item data is required' }, { status: 400 });
    }

    // Generate component HTML string directly
    const componentHtml = generateReportHtml(item, columns, evidence);

    // Full HTML document with Tailwind CDN for styling in the PDF
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
    
    // Set content and wait for network idle to ensure images/fonts/scripts (Tailwind) are loaded
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
        'Content-Disposition': `attachment; filename="Reporte-${item.name.replace(/\s+/g, '_')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
