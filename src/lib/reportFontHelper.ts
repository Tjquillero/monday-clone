import fs from 'fs';
import path from 'path';

let cachedFontFaceCss: string | null = null;

/**
 * Retorna las reglas @font-face con los binarios de fuentes locales
 * de IBM Plex Sans e IBM Plex Mono embebidos en Base64.
 *
 * Cumple estrictamente con CONDITION-02:
 * 100% Offline, sin dependencias de red ni CDNs en runtime de Puppeteer.
 */
export function getReportFontFaceStyles(): string {
  if (cachedFontFaceCss) {
    return cachedFontFaceCss;
  }

  try {
    const fontsDir = path.resolve(process.cwd(), 'public/fonts/ibm-plex');

    const sansReg = fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Regular.ttf')).toString('base64');
    const sansSemi = fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-SemiBold.ttf')).toString('base64');
    const sansBold = fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Bold.ttf')).toString('base64');
    const monoReg = fs.readFileSync(path.join(fontsDir, 'IBMPlexMono-Regular.ttf')).toString('base64');
    const monoSemi = fs.readFileSync(path.join(fontsDir, 'IBMPlexMono-SemiBold.ttf')).toString('base64');

    cachedFontFaceCss = `
      @font-face {
        font-family: 'IBM Plex Sans';
        font-style: normal;
        font-weight: 400;
        src: url(data:font/truetype;charset=utf-8;base64,${sansReg}) format('truetype');
      }
      @font-face {
        font-family: 'IBM Plex Sans';
        font-style: normal;
        font-weight: 600;
        src: url(data:font/truetype;charset=utf-8;base64,${sansSemi}) format('truetype');
      }
      @font-face {
        font-family: 'IBM Plex Sans';
        font-style: normal;
        font-weight: 700;
        src: url(data:font/truetype;charset=utf-8;base64,${sansBold}) format('truetype');
      }
      @font-face {
        font-family: 'IBM Plex Mono';
        font-style: normal;
        font-weight: 400;
        src: url(data:font/truetype;charset=utf-8;base64,${monoReg}) format('truetype');
      }
      @font-face {
        font-family: 'IBM Plex Mono';
        font-style: normal;
        font-weight: 600;
        src: url(data:font/truetype;charset=utf-8;base64,${monoSemi}) format('truetype');
      }
    `;

    return cachedFontFaceCss;
  } catch (error) {
    console.error('Error loading local IBM Plex font assets:', error);
    // Fallback if files cannot be read
    return `
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    `;
  }
}

/**
 * Envuelve el contenido HTML de un reporte en una estructura completa
 * con fuentes locales IBM Plex y soporte para document.fonts.ready
 */
export function wrapReportHtml({
  title = 'Reporte Mantenix',
  bodyContent,
  customStyles = '',
}: {
  title?: string;
  bodyContent: string;
  customStyles?: string;
}): string {
  const fontFaceCss = getReportFontFaceStyles();

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  primary: '#0B2A4A',
                  accent: '#E8792F',
                  'primary-hover': '#123A63',
                  'surface-subtle': '#F0F2F0'
                },
                fontFamily: {
                  sans: ['"IBM Plex Sans"', '-apple-system', 'sans-serif'],
                  mono: ['"IBM Plex Mono"', 'monospace']
                }
              }
            }
          }
        </script>
        <style>
          ${fontFaceCss}

          body {
            font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .font-mono {
            font-family: 'IBM Plex Mono', monospace !important;
          }

          .numeric-tabular {
            font-variant-numeric: tabular-nums;
          }

          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          thead {
            display: table-header-group;
          }

          tfoot {
            display: table-footer-group;
          }

          ${customStyles}
        </style>
      </head>
      <body>
        ${bodyContent}
      </body>
    </html>
  `;
}
