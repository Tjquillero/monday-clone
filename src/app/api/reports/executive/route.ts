import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateExecutiveReportHtml } from '@/components/reports/ExecutiveReportTemplate';

export async function POST(req: NextRequest) {
  console.log('Received request for Executive Report');
  try {
    const { projectName, evidenceData } = await req.json();
    console.log('Payload parsed:', { projectName, itemsCount: evidenceData?.length });

    if (!projectName || !evidenceData) {
      return NextResponse.json({ error: 'Project name and evidence data are required' }, { status: 400 });
    }

    // Generate component HTML string
    const componentHtml = generateExecutiveReportHtml(projectName, evidenceData);

    // Full HTML document with styles and Tailwind
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
              color: #1e293b;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
            }

            .report-wrapper {
              width: 100%;
            }

            /* Portada */
            .cover-page {
              height: 200mm;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              align-items: center;
              background-color: #fff;
              position: relative;
              page-break-after: always;
              text-align: center;
              overflow: hidden;
              padding: 2rem 0;
            }

            .cover-content {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              width: 80%;
              margin-bottom: 2rem;
            }

            .cover-logo-wrapper {
              margin-bottom: 2rem;
            }

            .cover-title {
              font-size: 3rem;
              font-weight: 900;
              color: #24614b;
              margin-bottom: 1rem;
              letter-spacing: -0.05em;
            }

            .cover-divider {
              width: 100px;
              height: 6px;
              background-color: #24614b;
              margin: 2rem 0;
            }

            .cover-project-name {
              font-size: 1.5rem;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              margin-bottom: 4rem;
            }

            .cover-footer {
              margin-top: auto;
            }

            .cover-date {
              font-size: 1.1rem;
              font-weight: 600;
              color: #1e293b;
            }

            .cover-company {
              font-size: 0.9rem;
              color: #94a3b8;
              font-weight: 600;
            }

            .cover-app-brand {
              margin-top: auto;
              margin-bottom: 2rem;
              font-size: 0.8rem;
              font-weight: 800;
              color: #cbd5e1;
              text-transform: uppercase;
              letter-spacing: 0.1em;
            }

            /* Header (subsequent pages) */
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 2rem;
              padding-bottom: 1rem;
              border-bottom: 2px solid #f1f5f9;
              width: 100%;
            }

            .header-left {
              display: flex;
              align-items: center;
              gap: 1rem;
            }

            .header-mini-logo {
              flex-shrink: 0;
            }

            .subtitle {
              font-size: 0.8rem;
              font-weight: 700;
              color: #64748b;
              margin: 0;
              text-align: left;
            }

            .date {
              font-size: 0.8rem;
              font-weight: 600;
              color: #94a3b8;
              margin: 0;
            }

            /* Items */
            .item-container {
              margin-bottom: 3rem;
              page-break-inside: avoid;
            }

            .item-header-v2 {
              background-color: #f1f5f9;
              padding: 1rem 1.5rem;
              border-radius: 1rem;
              display: flex;
              align-items: center;
              gap: 1rem;
              margin-bottom: 1.5rem;
            }

            .item-code {
              background-color: #24614b;
              color: white;
              padding: 0.25rem 0.75rem;
              border-radius: 0.5rem;
              font-weight: 900;
              font-size: 0.9rem;
            }

            .item-name {
              font-size: 1.25rem;
              font-weight: 800;
              color: #1e293b;
            }

            .description {
              font-size: 0.9rem;
              line-height: 1.6;
              color: #475569;
              margin-bottom: 1.5rem;
              padding: 0 1rem;
            }

            /* Table */
            .table-container {
              margin-bottom: 2rem;
              padding: 0 1rem;
            }

            .report-table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
            }

            .report-table th {
              background-color: #f8fafc;
              color: #64748b;
              font-size: 0.7rem;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              padding: 0.75rem 1rem;
              text-align: left;
              border-bottom: 2px solid #e2e8f0;
            }

            .report-table td {
              padding: 0.75rem 1rem;
              font-size: 0.85rem;
              border-bottom: 1px solid #f1f5f9;
            }

            .total-row td {
              background-color: #f8fafc;
              font-weight: 900;
              color: #1e293b;
              border-top: 2px solid #e2e8f0;
            }

            /* Evidence */
            .evidence-section {
              padding: 0 1rem;
            }

            .location-group {
              margin-bottom: 2rem;
            }

            .location-header {
              font-size: 0.8rem;
              font-weight: 800;
              color: #24614b;
              text-transform: uppercase;
              margin-bottom: 1rem;
              border-left: 4px solid #24614b;
              padding-left: 0.75rem;
            }

            .photo-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 1.5rem;
            }

            .photo-card {
              break-inside: avoid;
            }

            .img-wrapper {
              position: relative;
              border-radius: 1rem;
              overflow: hidden;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
              background-color: #f8fafc;
              aspect-ratio: 4/3;
            }

            .img-wrapper img {
              width: 100%;
              height: 100%;
              object-cover: cover;
            }

            .photo-badge {
              position: absolute;
              bottom: 0.75rem;
              left: 0.75rem;
              background-color: rgba(36, 97, 75, 0.9);
              color: white;
              font-size: 0.6rem;
              font-weight: 900;
              padding: 0.25rem 0.5rem;
              border-radius: 0.25rem;
              backdrop-filter: blur(4px);
            }

            .separator {
              border: 0;
              height: 1px;
              background-color: #e2e8f0;
              margin: 4rem 0;
            }

            .footer {
              padding: 2rem;
              text-align: center;
              border-top: 1px solid #f1f5f9;
              color: #94a3b8;
              font-size: 0.7rem;
              font-weight: 600;
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
    page.setDefaultNavigationTimeout(120000);
    
    // Set content and wait for network idle (increased timeout)
    await page.setContent(fullHtml, { 
      waitUntil: 'networkidle0',
      timeout: 120000 
    });

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
        'Content-Disposition': `attachment; filename="Reporte_Ejecutivo_${projectName.replace(/\s+/g, '_')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Executive PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
