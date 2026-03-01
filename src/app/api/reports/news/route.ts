import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateNewsReportHtml } from '@/components/reports/NewsReportTemplate';

export async function POST(req: NextRequest) {
  console.log('Received request for News Report');
  try {
    const { projectName, incidents } = await req.json();
    console.log('Payload parsed:', { projectName, incidentsCount: incidents?.length });

    if (!projectName || !incidents) {
      return NextResponse.json({ error: 'Project name and incidents data are required' }, { status: 400 });
    }

    // Generate component HTML string
    const componentHtml = generateNewsReportHtml(projectName, incidents);

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
                    danger: '#e2445c',
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

            .cover-page {
              height: 200mm; /* Reduced further to ensure fit */
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
              margin-bottom: 2rem;
              page-break-inside: avoid;
              background-color: #fff;
              border: 1px solid #f1f5f9;
              border-radius: 1rem;
              padding: 1.5rem;
            }

            .incident-header {
              padding-left: 1rem;
              margin-bottom: 1rem;
            }

            .incident-meta {
              display: flex;
              gap: 0.75rem;
              margin-bottom: 0.5rem;
              font-size: 0.7rem;
              font-weight: 800;
              text-transform: uppercase;
              align-items: center;
            }

            .incident-severity {
              padding: 0.2rem 0.6rem;
              border-radius: 0.4rem;
            }

            .incident-date {
              color: #94a3b8;
            }
            
            .incident-type {
              color: #64748b;
              background-color: #f1f5f9;
              padding: 0.2rem 0.6rem;
              border-radius: 0.4rem;
            }

            .incident-title {
              font-size: 1.5rem;
              font-weight: 900;
              color: #1e293b;
              margin: 0 0 0.25rem 0;
            }

            .incident-site {
              font-size: 0.85rem;
              font-weight: 700;
              color: #64748b;
            }

            .description-box {
              background-color: #f8fafc;
              padding: 1rem;
              border-radius: 0.75rem;
              margin-bottom: 1.5rem;
            }

            .section-title {
              font-size: 0.65rem;
              font-weight: 900;
              color: #94a3b8;
              margin: 0 0 0.5rem 0;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }

            .description-box p {
              margin: 0;
              font-size: 0.9rem;
              color: #334155;
              line-height: 1.5;
            }

            /* Evidence */
            .evidence-section {
              margin-top: 1rem;
            }

            .photo-card-large {
              break-inside: avoid;
              width: 100%;
            }

            .img-wrapper-large {
              position: relative;
              border-radius: 1rem;
              overflow: hidden;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
              background-color: #f8fafc;
              aspect-ratio: 16/9;
              max-height: 400px;
            }

            .img-wrapper-large img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            .photo-badge {
              position: absolute;
              bottom: 1rem;
              left: 1rem;
              background-color: rgba(0, 0, 0, 0.7);
              color: white;
              font-size: 0.7rem;
              font-weight: 900;
              padding: 0.35rem 0.75rem;
              border-radius: 0.5rem;
              backdrop-filter: blur(4px);
              text-transform: uppercase;
            }

            .separator {
              border: 0;
              height: 1px;
              background-color: #e2e8f0;
              margin: 3rem 0;
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
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    
    // Set content and wait for network idle (increased timeout for slow images)
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
        'Content-Disposition': `attachment; filename="Reporte_Novedades_${projectName.replace(/\s+/g, '_')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('News PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
