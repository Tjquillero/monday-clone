/**
 * HTML/CSS Report Template for Activity Execution Report & Photographic Evidence Support
 * Evidence Layer del Acta
 * 
 * Rendered to PDF via Puppeteer.
 * 0 DDL, 0 DB mutations, 100% presentation layer.
 */

import { ResolvedActivityExecutionReportDTO } from '../../../../lib/activityReportAssetResolver';

export function renderActivityExecutionReportHTML(report: ResolvedActivityExecutionReportDTO): string {
  const { header, fronts, signatories } = report;

  const draftWatermark = header.is_draft
    ? `<div class="watermark">BORRADOR PRELIMINAR</div>`
    : '';

  const frontSectionsHTML = fronts
    .map((front) => {
      const activitiesHTML = front.activities
        .map((act) => {
          const beforePhotos = act.evidence.before || [];
          const afterPhotos = act.evidence.after || [];

          let beforeColumnHTML = '';
          if (beforePhotos.length > 0) {
            beforeColumnHTML = beforePhotos
              .map(
                (p) => `
              <div class="photo-card">
                <img src="${p.signed_url}" alt="Foto Previa" />
                <div class="photo-meta">
                  <span>FASE: ANTES</span>
                  ${p.has_gps ? '<span class="gps-badge">GPS ✓</span>' : ''}
                </div>
              </div>`
              )
              .join('');
          } else {
            beforeColumnHTML = `<div class="missing-badge">Sin registro fotográfico previo</div>`;
          }

          let afterColumnHTML = '';
          if (afterPhotos.length > 0) {
            afterColumnHTML = afterPhotos
              .map(
                (p) => `
              <div class="photo-card">
                <img src="${p.signed_url}" alt="Foto Posterior" />
                <div class="photo-meta">
                  <span>FASE: DESPUÉS</span>
                  ${p.has_gps ? '<span class="gps-badge">GPS ✓</span>' : ''}
                </div>
              </div>`
              )
              .join('');
          } else {
            afterColumnHTML = `<div class="missing-badge">Sin registro fotográfico posterior</div>`;
          }

          let docsHTML = '';
          if (act.documents && act.documents.length > 0) {
            docsHTML = `
            <div class="docs-section">
              <strong>Soportes Documentales (Certificados de Disposición Final / Vertimiento):</strong>
              <ul>
                ${act.documents
                  .map((d) => `<li>📄 ${d.file_name} (${d.file_type})</li>`)
                  .join('')}
              </ul>
            </div>`;
          }

          const certifiedText = act.certified_qty !== undefined
            ? ` | <span class="cert-qty">Certificado: <strong>${act.certified_qty.toLocaleString('es-CO')} ${act.unit}</strong></span>`
            : '';

          return `
          <div class="activity-block">
            <div class="activity-header">
              <div class="act-title">${act.activity_name} (${act.activity_key})</div>
              <div class="act-metrics">
                Ejecutado: <strong>${act.executed_qty.toLocaleString('es-CO')} ${act.unit}</strong>${certifiedText}
              </div>
            </div>

            <div class="evidence-grid">
              <div class="phase-col">
                <div class="phase-title">EVIDENCIA ANTES (≤ 2)</div>
                <div class="photos-container">${beforeColumnHTML}</div>
              </div>
              <div class="phase-col">
                <div class="phase-title">EVIDENCIA DESPUÉS (≤ 2)</div>
                <div class="photos-container">${afterColumnHTML}</div>
              </div>
            </div>

            ${docsHTML}
          </div>`;
        })
        .join('');

      return `
      <div class="front-section">
        <div class="front-header">
          <h2>FRENTE / SITIO: ${front.site_name} ${front.front_name ? `- ${front.front_name}` : ''}</h2>
        </div>
        ${activitiesHTML}
      </div>`;
    })
    .join('');

  const dirSig = signatories.project_director
    ? `<div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-name">${signatories.project_director.name}</div>
        <div class="sig-title">${signatories.project_director.title}</div>
       </div>`
    : `<div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-title">Director de Proyecto</div>
       </div>`;

  const intSig = signatories.interventor
    ? `<div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-name">${signatories.interventor.name}</div>
        <div class="sig-title">${signatories.interventor.title}</div>
       </div>`
    : `<div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-title">Interventor de Obra</div>
       </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de Ejecución de Actividades y Soporte Fotográfico</title>
  <style>
    @page {
      size: letter portrait;
      margin: 15mm;
    }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11pt;
    }
    .watermark {
      position: fixed;
      top: 40%;
      left: 10%;
      width: 80%;
      text-align: center;
      font-size: 42pt;
      font-weight: 800;
      color: rgba(226, 232, 240, 0.45);
      transform: rotate(-30deg);
      pointer-events: none;
      z-index: 999;
      letter-spacing: 4px;
    }
    .simulation-banner {
      background: #fff1f2;
      color: #991b1b;
      border: 2px dashed #f43f5e;
      padding: 10px;
      text-align: center;
      font-weight: 800;
      font-size: 12pt;
      margin-bottom: 15px;
      letter-spacing: 1px;
      border-radius: 4px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      border: 1px solid #cbd5e1;
    }
    .header-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
    }
    .header-title {
      text-align: center;
      font-weight: bold;
      font-size: 13pt;
      color: #0f172a;
      background: #f8fafc;
    }
    .meta-grid {
      width: 100%;
      margin-bottom: 20px;
      border-collapse: collapse;
    }
    .meta-grid td {
      padding: 4px 8px;
      font-size: 10pt;
    }
    .meta-label {
      font-weight: bold;
      color: #475569;
      width: 160px;
    }
    .front-section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    .front-header {
      background: #1e293b;
      color: #ffffff;
      padding: 8px 14px;
      font-size: 12pt;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .front-header h2 {
      margin: 0;
      font-size: 11pt;
      font-weight: 600;
    }
    .activity-block {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
      background: #fafafa;
    }
    .activity-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #cbd5e1;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .act-title {
      font-weight: bold;
      font-size: 11pt;
      color: #0f172a;
    }
    .act-metrics {
      font-size: 10pt;
      color: #334155;
    }
    .cert-qty {
      color: #2563eb;
    }
    .evidence-grid {
      display: table;
      width: 100%;
      table-layout: fixed;
    }
    .phase-col {
      display: table-cell;
      width: 50%;
      padding: 0 6px;
      vertical-align: top;
    }
    .phase-title {
      font-size: 9pt;
      font-weight: bold;
      color: #475569;
      margin-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
    }
    .photos-container {
      display: flex;
      gap: 8px;
    }
    .photo-card {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
      padding: 4px;
      text-align: center;
    }
    .photo-card img {
      width: 100%;
      height: 120px;
      object-fit: cover;
      border-radius: 2px;
    }
    .photo-meta {
      font-size: 8pt;
      color: #64748b;
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      padding: 0 4px;
    }
    .gps-badge {
      background: #dcfce7;
      color: #166534;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: bold;
    }
    .missing-badge {
      background: #f1f5f9;
      color: #94a3b8;
      border: 1px dashed #cbd5e1;
      padding: 20px;
      text-align: center;
      font-size: 9pt;
      border-radius: 4px;
    }
    .docs-section {
      margin-top: 10px;
      padding: 8px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 4px;
      font-size: 9pt;
    }
    .docs-section ul {
      margin: 4px 0 0 0;
      padding-left: 18px;
    }
    .signatures-grid {
      display: table;
      width: 100%;
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .sig-box {
      display: table-cell;
      width: 50%;
      text-align: center;
      padding: 0 20px;
    }
    .sig-line {
      border-top: 1px solid #475569;
      margin-bottom: 6px;
      width: 80%;
      margin-left: auto;
      margin-right: auto;
    }
    .sig-name {
      font-weight: bold;
      font-size: 10pt;
    }
    .sig-title {
      font-size: 9pt;
      color: #64748b;
    }
  </style>
</head>
<body>
  ${header.is_simulation ? `<div class="simulation-banner">ENTORNO DE PRUEBA / EVIDENCIA FOTOGRÁFICA SIMULADA</div>` : ''}
  ${draftWatermark}

  <table class="header-table">
    <tr>
      <td style="width: 25%; text-align: center;">
        <strong>CONSORCIO CONSERVACIÓN PLAYA</strong>
      </td>
      <td class="header-title">
        INFORME DE EJECUCIÓN DE ACTIVIDADES Y SOPORTE FOTOGRÁFICO
      </td>
      <td style="width: 25%; text-align: center; font-size: 9pt;">
        Contrato: ${header.contract_number}<br>
        Acta Nº: ${header.acta_number || 'N/A'}
      </td>
    </tr>
  </table>

  <table class="meta-grid">
    <tr>
      <td class="meta-label">PROYECTO:</td>
      <td>${header.project_name}</td>
      <td class="meta-label">PERÍODO:</td>
      <td>${header.period_start} al ${header.period_end}</td>
    </tr>
    <tr>
      <td class="meta-label">CONTRATISTA:</td>
      <td>${header.contractor_name}</td>
      <td class="meta-label">ESTADO DOCUMENTO:</td>
      <td>${header.is_draft ? 'Borrador Preliminar' : 'Oficial Emitido'} ${header.issued_at ? `(${header.issued_at.slice(0, 10)})` : ''}</td>
    </tr>
    <tr>
      <td class="meta-label">INTERVENTORÍA:</td>
      <td colspan="3">${header.interventoria_name}</td>
    </tr>
  </table>

  ${frontSectionsHTML}

  <div class="signatures-grid">
    ${dirSig}
    ${intSig}
  </div>
</body>
</html>`;
}
