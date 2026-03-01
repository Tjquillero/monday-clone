
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateActaReportHtml } from '@/components/reports/ActaReportTemplate';

export async function POST(req: NextRequest) {
  try {
    const { acta, tableData } = await req.json();

    if (!acta || !tableData) {
      return NextResponse.json({ error: 'Acta and table data are required' }, { status: 400 });
    }

    // Generate component HTML string
    const componentHtml = generateActaReportHtml(acta, tableData);

    // Full HTML document
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
            
            body { 
              font-family: 'Inter', sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
            }
            .font-serif {
                font-family: 'Playfair Display', serif;
            }
          </style>
        </head>
        <body>
          ${componentHtml}
        </body>
      </html>
    `;

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0', // Wait for external resources (fonts, cdn)
      timeout: 60000 
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      landscape: true, // Landscape for wide table
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm'
      }
    });

    await browser.close();

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Acta_${acta.name}.pdf"`
      }
    });

  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
