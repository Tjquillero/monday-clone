export interface ExecutiveLocation {
  id: string;
  name: string;
  quantity: number;
  photos: string[]; // URLs
}

export interface ExecutiveReportItem {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  locations: ExecutiveLocation[];
}

export function generateExecutiveReportHtml(projectName: string, reportItems: ExecutiveReportItem[]) {
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
          <h1 class="cover-title">INFORME EJECUTIVO DE GESTIÓN</h1>
          <div class="cover-divider"></div>
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
        ${reportItems.map(item => `
          <div class="item-container">
            
            <!-- Item Header -->
            <div class="item-header-v2">
              <span class="item-code">${item.code}</span>
              <span class="item-name">${item.name}</span>
            </div>      

            <!-- 2. Description -->
            <div class="description">
               <p>${item.description || 'Sin descripción detallada disponible para esta actividad.'}</p>
            </div>

            <!-- 3. Execution Table -->
            <div class="table-container">
               <table class="report-table">
                  <thead>
                     <tr>
                        <th class="w-16">ITEM</th>
                        <th>DESCRIPCION (SITIO)</th>
                        <th class="w-24">UND</th>
                        <th class="w-32">CANTIDAD</th>
                     </tr>
                  </thead>
                  <tbody>
                     ${item.locations.map((loc, idx) => `
                     <tr>
                        <td class="text-center font-bold">${idx + 1}</td>
                        <td class="font-medium uppercase">${loc.name}</td>
                        <td class="text-center uppercase font-bold">${item.unit}</td>
                        <td class="text-center font-black">${loc.quantity.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                     </tr>
                     `).join('')}
                     <!-- Total Row -->
                     <tr class="total-row">
                        <td class="text-right" colspan="3">TOTAL EJECUTADO:</td>
                        <td class="text-center">
                           ${item.locations.reduce((acc, l) => acc + l.quantity, 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                     </tr>
                  </tbody>
               </table>
            </div>

            <!-- 4. Photo Evidence Grid -->
            <div class="evidence-section">
               ${item.locations.filter(l => l.photos.length > 0).map(loc => `
                  <div class="location-group">
                     <div class="location-header">
                        ${loc.name}
                     </div>
                     <div class="photo-grid">
                        ${loc.photos.map((photo, pIdx) => `
                           <div class="photo-card">
                              <div class="img-wrapper">
                                 <img src="${photo}" />
                                 <div class="photo-badge">
                                    EVIDENCIA ${pIdx + 1}
                                 </div>
                              </div>
                           </div>
                        `).join('')}
                     </div>
                  </div>
               `).join('')}
            </div>

          </div>
          <hr class="separator" />
        `).join('')}
      </div>

      <!-- Footer -->
      <div class="footer">
         <p>Generado por Mantenix Platform</p>
      </div>

    </div>
  `;
}
