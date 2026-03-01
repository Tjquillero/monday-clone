export interface NewsReportItem {
  id: string;
  date: string;       // ISO Date string
  severity: string;   // Critical, Medium, Low
  type: string;       // Safety, Quality, Delay, Other
  itemName: string;   // Activity Name
  siteName: string;   // Group/Site Name
  description: string;
  solution?: string;
  photo?: string;
}

export function generateNewsReportHtml(projectName: string, reportItems: NewsReportItem[]) {
  const dateStr = new Date().toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const logoSvg = `
    <svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#2c7be5"/>
      <path d="M25,38 Q37.5,28 50,38 T75,38" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" />
      <path d="M25,53 Q37.5,43 50,53 T75,53" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" />
      <path d="M25,68 Q37.5,58 50,68 T75,68" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" />
    </svg>
  `;

  return `
    <div class="report-wrapper">
      
      <!-- PORTADA -->
      <div class="cover-page">
        <div class="cover-content">
          <div class="cover-logo-wrapper">
            ${logoSvg}
          </div>
          <h1 class="cover-title" style="color: #e2445c;">REPORTE DE NOVEDADES E INCIDENCIAS</h1>
          <div class="cover-divider" style="background-color: #e2445c;"></div>
          <h2 class="cover-project-name">${projectName}</h2>
          <div class="cover-footer">
            <p class="cover-date">${dateStr}</p>
            <p class="cover-company">Consorcio Conservación Costera</p>
          </div>
        </div>
        <div class="cover-app-brand">
          <span>Gestionado con Mantenix</span>
        </div>
      </div>

      <!-- Main Header (on subsequent pages) -->
      <div class="header no-print">
        <div class="header-left">
          <div class="header-mini-logo">
            <svg width="35" height="35" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="#2c7be5"/>
              <path d="M25,38 Q37.5,28 50,38 T75,38" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" />
              <path d="M25,53 Q37.5,43 50,53 T75,53" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" />
              <path d="M25,68 Q37.5,58 50,68 T75,68" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" />
            </svg>
          </div>
          <div>
            <p class="subtitle">${projectName}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="date">${dateStr}</p>
        </div>
      </div>

      <!-- Items Loop -->
      <div class="items-container">
        ${reportItems.map((item, index) => {
          const severityColor = item.severity === 'Critical' ? '#ef4444' : item.severity === 'Medium' ? '#f97316' : '#3b82f6';
          const severityLabel = item.severity === 'Critical' ? 'CRÍTICA' : item.severity === 'Medium' ? 'MEDIA' : 'BAJA';
          const isLast = index === reportItems.length - 1;
          
          return `
          <div class="item-container">
            
            <!-- Incident Header -->
            <div class="incident-header" style="border-left: 6px solid ${severityColor};">
              <div class="incident-meta">
                <span class="incident-severity" style="background-color: ${severityColor}15; color: ${severityColor};">
                  ${severityLabel}
                </span>
                <span class="incident-date">
                  ${new Date(item.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
                <span class="incident-type">${item.type}</span>
              </div>
              <h3 class="incident-title">${item.itemName}</h3>
              <p class="incident-site">📍 ${item.siteName}</p>
            </div>      

            <!-- Description -->
            <div class="description-box">
               <h4 class="section-title">DESCRIPCIÓN DE LA NOVEDAD</h4>
               <p>${item.description || 'Sin descripción detallada disponible.'}</p>
            </div>

            <!-- Solution -->
            ${item.solution ? `
            <div class="description-box" style="background-color: #f0fdf4; border-left: 4px solid #22c55e;">
               <h4 class="section-title" style="color: #166534;">SOLUCIÓN / RESPUESTA ADMINISTRATIVA</h4>
               <p style="color: #14532d;">${item.solution}</p>
            </div>
            ` : ''}

            <!-- Evidence Photo -->
            ${item.photo ? `
            <div class="evidence-section">
               <div class="photo-card-large">
                  <div class="img-wrapper-large">
                     <img src="${item.photo}" />
                     <div class="photo-badge">
                        EVIDENCIA FOTOGRÁFICA
                     </div>
                  </div>
               </div>
            </div>
            ` : ''}

          </div>
          ${!isLast ? '<hr class="separator" />' : ''}
          `;
        }).join('')}
      </div>

      <!-- Footer -->
      <div class="footer">
         <p>Generado por Mantenix Platform</p>
      </div>

    </div>
  `;
}
