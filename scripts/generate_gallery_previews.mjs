import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const BASE_DIR = path.resolve('brand-assets');
const PREVIEWS_DIR = path.join(BASE_DIR, 'previews');
const ARTIFACT_DIR = path.resolve('C:/Users/Admin Proyecto/.gemini/antigravity-ide/brain/f8e51199-c70a-44f9-8bda-f62995fa4ed7');

if (!fs.existsSync(PREVIEWS_DIR)) {
  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
}

async function generateVisualGallery() {
  console.log('🎨 Generando renders visuales de alta fidelidad para la Exposición Visual BRAND-01...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  async function renderHtmlToPng(htmlContent, width, height, outputPath, scaleFactor = 2) {
    await page.setViewport({ width, height, deviceScaleFactor: scaleFactor });
    const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; overflow: hidden; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>`;
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.screenshot({ path: outputPath, omitBackground: true, type: 'png' });
    console.log(`  ✓ Renderizado: ${path.basename(outputPath)} (${width}x${height})`);
  }

  // 1. Símbolo sobre fondo blanco
  const symbolWhiteBgHtml = `
    <div style="width: 400px; height: 400px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; border-radius: 20px; box-shadow: 0 8px 30px rgba(11,42,74,0.08); border: 1px solid #E1E4E2;">
      <svg viewBox="0 0 512 512" width="280" height="280">
        <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
        <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
      </svg>
    </div>
  `;
  await renderHtmlToPng(symbolWhiteBgHtml, 400, 400, path.join(PREVIEWS_DIR, '01_symbol_on_white.png'));

  // 2. Símbolo sobre fondo Navy (#0B1420)
  const symbolNavyBgHtml = `
    <div style="width: 400px; height: 400px; background: #0B1420; display: flex; align-items: center; justify-content: center; border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); border: 1px solid #223347;">
      <svg viewBox="0 0 512 512" width="280" height="280">
        <circle cx="256" cy="256" r="240" fill="#121D2B" stroke="#223347" stroke-width="8"/>
        <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
      </svg>
    </div>
  `;
  await renderHtmlToPng(symbolNavyBgHtml, 400, 400, path.join(PREVIEWS_DIR, '02_symbol_on_navy.png'));

  // 3. Escalera de Legibilidad Responsive (16, 24, 32, 48, 72 px - Render Vectorial Directo)
  const scaleLadderHtml = `
    <div style="width: 680px; height: 260px; background: #F7F8F6; padding: 24px 30px; border-radius: 16px; border: 1px solid #E1E4E2; display: flex; flex-direction: column; justify-content: space-between;">
      <div style="font-size: 13px; font-weight: 700; color: #4A5560; letter-spacing: 1px; text-transform: uppercase;">Escalera de Legibilidad Óptica Multi-Escala (Render Vectorial Puro)</div>
      <div style="display: flex; align-items: flex-end; justify-content: space-around; gap: 16px; background: #FFFFFF; padding: 24px; border-radius: 12px; border: 1px solid #E1E4E2;">

        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <!-- 16px micro-mark vector -->
          <svg viewBox="0 0 32 32" width="16" height="16">
            <circle cx="16" cy="16" r="15" fill="#0B2A4A"/>
            <path d="M 7 21 C 9 18, 11 19, 13 18 C 15 17, 16.5 12.5, 19.5 12.5 C 22.5 12.5, 23.5 18, 25.5 18" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="19.5" cy="12.5" r="2.2" fill="#E8792F" stroke="#FFFFFF" stroke-width="0.8"/>
          </svg>
          <span style="font-size: 11px; font-weight: 600; color: #8A94A0;">16 px</span>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <!-- 24px vector -->
          <svg viewBox="0 0 512 512" width="24" height="24">
            <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
            <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
          </svg>
          <span style="font-size: 11px; font-weight: 600; color: #8A94A0;">24 px</span>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <!-- 32px vector -->
          <svg viewBox="0 0 512 512" width="32" height="32">
            <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
            <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
          </svg>
          <span style="font-size: 11px; font-weight: 600; color: #8A94A0;">32 px</span>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <!-- 48px vector -->
          <svg viewBox="0 0 512 512" width="48" height="48">
            <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
            <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
          </svg>
          <span style="font-size: 11px; font-weight: 600; color: #8A94A0;">48 px</span>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <!-- 72px vector -->
          <svg viewBox="0 0 512 512" width="72" height="72">
            <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
            <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
          </svg>
          <span style="font-size: 11px; font-weight: 600; color: #8A94A0;">72 px</span>
        </div>

      </div>
    </div>
  `;
  await renderHtmlToPng(scaleLadderHtml, 680, 260, path.join(PREVIEWS_DIR, '03_scale_ladder.png'));

  // 4. Logo Horizontal sobre Claro
  const logoHorizontalLightHtml = `
    <div style="width: 700px; height: 180px; background: #FFFFFF; display: flex; align-items: center; padding: 20px 40px; border-radius: 16px; border: 1px solid #E1E4E2; box-shadow: 0 4px 20px rgba(11,42,74,0.06);">
      <svg viewBox="0 0 512 512" width="80" height="80" style="margin-right: 24px; flex-shrink: 0;">
        <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
        <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
      </svg>
      <span style="font-weight: 800; font-size: 64px; color: #0B2A4A; letter-spacing: -2px;">Mantenix</span>
    </div>
  `;
  await renderHtmlToPng(logoHorizontalLightHtml, 700, 180, path.join(PREVIEWS_DIR, '04_logo_horizontal_light.png'));

  // 5. Logo Horizontal sobre Oscuro
  const logoHorizontalDarkHtml = `
    <div style="width: 700px; height: 180px; background: #0B1420; display: flex; align-items: center; padding: 20px 40px; border-radius: 16px; border: 1px solid #223347; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
      <svg viewBox="0 0 512 512" width="80" height="80" style="margin-right: 24px; flex-shrink: 0;">
        <circle cx="256" cy="256" r="240" fill="#121D2B" stroke="#223347" stroke-width="12"/>
        <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
      </svg>
      <span style="font-weight: 800; font-size: 64px; color: #FFFFFF; letter-spacing: -2px;">Mantenix</span>
    </div>
  `;
  await renderHtmlToPng(logoHorizontalDarkHtml, 700, 180, path.join(PREVIEWS_DIR, '05_logo_horizontal_dark.png'));

  // 6. Logo Vertical
  const logoVerticalHtml = `
    <div style="width: 380px; height: 340px; background: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; border-radius: 20px; border: 1px solid #E1E4E2; box-shadow: 0 8px 30px rgba(11,42,74,0.06);">
      <svg viewBox="0 0 512 512" width="130" height="130">
        <circle cx="256" cy="256" r="240" fill="#0B2A4A"/>
        <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
      </svg>
      <span style="font-weight: 800; font-size: 48px; color: #0B2A4A; letter-spacing: -1.5px;">Mantenix</span>
      <span style="font-size: 13px; font-weight: 600; color: #8A94A0; letter-spacing: 2px; text-transform: uppercase;">Gestión Operativa de Campo</span>
    </div>
  `;
  await renderHtmlToPng(logoVerticalHtml, 380, 340, path.join(PREVIEWS_DIR, '06_logo_vertical.png'));

  // 7. Matriz de Estados Operativos (10 Estados Canónicos)
  const statesGridHtml = `
    <div style="width: 800px; padding: 30px; background: #FFFFFF; border-radius: 16px; border: 1px solid #E1E4E2;">
      <div style="font-size: 14px; font-weight: 700; color: #0B2A4A; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px;">
        10 Estados Operativos — Regla: Color + Forma + Icono + Texto
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;">

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F7F8F6; border: 1px solid #E1E4E2; border-radius: 10px;">
          <span style="display: inline-flex; width: 18px; height: 18px; border: 2px dashed #8A94A0; border-radius: 50%;"></span>
          <span style="font-size: 14px; font-weight: 600; color: #4A5560;">Planificado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px;">
          <span style="display: inline-flex; width: 18px; height: 18px; border: 2px solid #2563EB; border-top-color: transparent; border-radius: 50%;"></span>
          <span style="font-size: 14px; font-weight: 600; color: #1E40AF;">En progreso</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 10px;">
          <span style="font-size: 14px; color: #7C3AED;">📄</span>
          <span style="font-size: 14px; font-weight: 600; color: #6D28D9;">Reportado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px;">
          <span style="font-size: 14px; color: #D97706;">📷</span>
          <span style="font-size: 14px; font-weight: 600; color: #B45309;">Pendiente de evidencia</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px;">
          <span style="font-size: 14px; color: #16A34A;">🛡️</span>
          <span style="font-size: 14px; font-weight: 600; color: #15803D;">Verificado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 10px;">
          <span style="font-size: 14px; color: #059669;">✓</span>
          <span style="font-size: 14px; font-weight: 600; color: #047857;">Confirmado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 10px;">
          <span style="font-size: 14px; color: #475569;">■</span>
          <span style="font-size: 14px; font-weight: 600; color: #334155;">Cerrado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px;">
          <span style="font-size: 14px; color: #DC2626;">✕</span>
          <span style="font-size: 14px; font-weight: 600; color: #B91C1C;">Rechazado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 10px;">
          <span style="font-size: 14px; color: #E8792F;">⚠</span>
          <span style="font-size: 14px; font-weight: 600; color: #C2410C;">Resagado</span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;">
          <span style="font-size: 14px; color: #94A3B8;">⏱</span>
          <span style="font-size: 14px; font-weight: 600; color: #64748B;">Futuro</span>
        </div>

      </div>
    </div>
  `;
  await renderHtmlToPng(statesGridHtml, 800, 360, path.join(PREVIEWS_DIR, '07_states_matrix.png'));

  // 8. Mockup de Header Mantenix
  const headerMockupHtml = `
    <div style="width: 1000px; height: 70px; background: #0B2A4A; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; border-radius: 14px; box-shadow: 0 8px 30px rgba(11,42,74,0.25);">
      <div style="display: flex; align-items: center; gap: 30px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <svg viewBox="0 0 512 512" width="36" height="36">
            <circle cx="256" cy="256" r="240" fill="#123A63" stroke="#223347" stroke-width="12"/>
            <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" stroke-width="6"/>
          </svg>
          <span style="font-weight: 800; font-size: 24px; color: #FFFFFF; letter-spacing: -0.5px;">Mantenix</span>
        </div>
        <div style="height: 24px; width: 1px; background: rgba(255,255,255,0.15);"></div>
        <div style="display: flex; gap: 20px;">
          <span style="color: #FFFFFF; font-size: 14px; font-weight: 600; border-bottom: 2px solid #E8792F; padding-bottom: 4px;">Mi Trabajo</span>
          <span style="color: #AAB4BF; font-size: 14px; font-weight: 500;">Planificación</span>
          <span style="color: #AAB4BF; font-size: 14px; font-weight: 500;">Verificación</span>
          <span style="color: #AAB4BF; font-size: 14px; font-weight: 500;">Actas</span>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 18px;">
        <div style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #082036; border: 1px solid #16324F; border-radius: 20px; font-size: 12px; color: #AAB4BF;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #22C55E;"></span>
          <span>Online</span>
        </div>
        <div style="width: 34px; height: 34px; border-radius: 50%; background: #16324F; display: flex; align-items: center; justify-content: center; color: #FFFFFF; font-size: 13px; font-weight: 700; border: 1px solid #223347;">
          JP
        </div>
      </div>
    </div>
  `;
  await renderHtmlToPng(headerMockupHtml, 1000, 70, path.join(PREVIEWS_DIR, '08_header_mockup.png'));

  // 9. Mockup de Tarjeta de /my-work
  const myWorkCardHtml = `
    <div style="width: 600px; background: #FFFFFF; border-radius: 14px; border: 1px solid #E1E4E2; padding: 24px; box-shadow: 0 4px 20px rgba(11,42,74,0.06);">

      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div>
          <span style="font-size: 12px; font-weight: 700; color: #8A94A0; text-transform: uppercase; letter-spacing: 1px;">Sitio · Sector Norte</span>
          <h3 style="font-size: 20px; font-weight: 800; color: #0B2A4A; margin-top: 2px;">Playa Blanca (Sector 1)</h3>
        </div>
        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; font-size: 12px; font-weight: 700; color: #B45309;">
          <span>📷</span> Pendiente de evidencia
        </div>
      </div>

      <div style="background: #F7F8F6; padding: 14px 18px; border-radius: 10px; border: 1px solid #E1E4E2; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 14px; font-weight: 600; color: #0B2A4A;">Limpieza Manual y Perfilado de Playa</div>
          <div style="font-size: 12px; color: #4A5560; margin-top: 2px;">Cuadrilla A-1 · Supervisor: Ing. Ramírez</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 18px; font-weight: 700; color: #0B2A4A; font-variant-numeric: tabular-nums;">450 / 600 M²</div>
          <div style="font-size: 11px; font-weight: 600; color: #E8792F;">75% Avance</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 13px; color: #8A94A0;">Meta planificada: 1 jornada</span>
        <button style="background: #E8792F; color: #FFFFFF; font-size: 14px; font-weight: 700; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(232,121,47,0.3);">
          <span>📷</span> REGISTRAR EJECUCIÓN
        </button>
      </div>

    </div>
  `;
  await renderHtmlToPng(myWorkCardHtml, 600, 240, path.join(PREVIEWS_DIR, '09_my_work_card.png'));

  // 10. Swatches de Color del Sistema
  const swatchesHtml = `
    <div style="width: 800px; padding: 26px; background: #FFFFFF; border-radius: 16px; border: 1px solid #E1E4E2;">
      <div style="font-size: 14px; font-weight: 700; color: #0B2A4A; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px;">
        Paleta Oficial — Contrastes y Jerarquías
      </div>
      <div style="display: flex; gap: 14px; margin-bottom: 16px;">
        <div style="flex: 1; height: 90px; background: #0B2A4A; border-radius: 10px; padding: 12px; color: #FFFFFF; display: flex; flex-direction: column; justify-content: space-between;">
          <span style="font-weight: 700; font-size: 13px;">Primary</span>
          <span style="font-size: 12px; opacity: 0.8;">#0B2A4A</span>
        </div>
        <div style="flex: 1; height: 90px; background: #123A63; border-radius: 10px; padding: 12px; color: #FFFFFF; display: flex; flex-direction: column; justify-content: space-between;">
          <span style="font-weight: 700; font-size: 13px;">Primary Hover</span>
          <span style="font-size: 12px; opacity: 0.8;">#123A63</span>
        </div>
        <div style="flex: 1; height: 90px; background: #E8792F; border-radius: 10px; padding: 12px; color: #FFFFFF; display: flex; flex-direction: column; justify-content: space-between;">
          <span style="font-weight: 700; font-size: 13px;">Accent</span>
          <span style="font-size: 12px; opacity: 0.9;">#E8792F</span>
        </div>
        <div style="flex: 1; height: 90px; background: #F7F8F6; border: 1px solid #E1E4E2; border-radius: 10px; padding: 12px; color: #0B2A4A; display: flex; flex-direction: column; justify-content: space-between;">
          <span style="font-weight: 700; font-size: 13px;">Background</span>
          <span style="font-size: 12px; color: #4A5560;">#F7F8F6</span>
        </div>
        <div style="flex: 1; height: 90px; background: #0B1420; border-radius: 10px; padding: 12px; color: #FFFFFF; display: flex; flex-direction: column; justify-content: space-between;">
          <span style="font-weight: 700; font-size: 13px;">Dark Base</span>
          <span style="font-size: 12px; opacity: 0.8;">#0B1420</span>
        </div>
      </div>
    </div>
  `;
  await renderHtmlToPng(swatchesHtml, 800, 200, path.join(PREVIEWS_DIR, '10_color_swatches.png'));

  // 11. Render Específico del Micro-Mark (a partir de mantenix-micro-mark.svg real)
  const microMarkSvgContent = fs.readFileSync(path.join(BASE_DIR, 'logos', 'mantenix-micro-mark.svg'), 'utf-8');
  const microMarkCardHtml = `
    <div style="width: 320px; height: 320px; background: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border-radius: 16px; border: 1px solid #E1E4E2; box-shadow: 0 4px 20px rgba(11,42,74,0.06);">
      <div style="font-size: 12px; font-weight: 700; color: #8A94A0; text-transform: uppercase; letter-spacing: 1px;">Micro-Mark SVG (32×32 Nativo)</div>
      <div style="padding: 24px; background: #F7F8F6; border-radius: 12px; border: 1px solid #E1E4E2; display: flex; align-items: center; justify-content: center;">
        ${microMarkSvgContent}
      </div>
      <span style="font-size: 12px; color: #4A5560;">Render 1:1 desde mantenix-micro-mark.svg</span>
    </div>
  `;
  await renderHtmlToPng(microMarkCardHtml, 320, 320, path.join(PREVIEWS_DIR, '11_micro_mark_32x32.png'), 1);

  await browser.close();
  console.log('✅ Renders visuales completados exitosamente');

  // Copiar previews al directorio de artefactos
  const previewFiles = fs.readdirSync(PREVIEWS_DIR);
  for (const f of previewFiles) {
    fs.copyFileSync(path.join(PREVIEWS_DIR, f), path.join(ARTIFACT_DIR, f));
  }
  console.log('✅ Previews copiados al directorio de artefactos');
}

generateVisualGallery().catch(err => {
  console.error('Error generando galería:', err);
  process.exit(1);
});
