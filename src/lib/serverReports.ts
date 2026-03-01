import { Item, Column, Group } from '@/types/monday';

export const generateServerItemPDF = async (item: Item, columns: Column[], evidence: any[] = []) => {
  try {
    const response = await fetch('/api/reports/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ item, columns, evidence }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte-${item.name.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Server PDF Error:', error);
    alert('Error al generar el reporte profesional. Por favor intente de nuevo.');
  }
};

export const generateBoardPDF = async (boardName: string, groups: Group[], columns: Column[]) => {
  try {
    const response = await fetch('/api/reports/board', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ boardName, groups, columns }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error || 'Failed to generate PDF');
      } catch (e: any) {
        throw new Error(e.message === 'Failed to generate PDF' ? e.message : `Server Error: ${response.status} ${response.statusText}`);
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Sitio_${boardName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Board PDF Error:', error);
    alert('Error al generar el reporte de sitio. Por favor intente de nuevo.');
  }
};

import { ExecutiveReportItem } from '@/components/reports/ExecutiveReportTemplate';

import { compressImage } from './imageUtils';

export const generateExecutivePDF = async (projectName: string, evidenceData: ExecutiveReportItem[]) => {
  try {
    // Compress images before sending
    const optimizedEvidence = await Promise.all(evidenceData.map(async (item) => {
      const optimizedLocations = await Promise.all(item.locations.map(async (loc) => {
        const optimizedPhotos = await Promise.all(loc.photos.map(async (photo) => {
          // Compress if base64
          if (photo && photo.startsWith('data:image')) {
            try {
              return await compressImage(photo, 1024, 0.7);
            } catch (err) {
              console.error('Failed to compress image:', err);
              return photo; // Fallback to original
            }
          }
          return photo;
        }));
        return { ...loc, photos: optimizedPhotos };
      }));
      return { ...item, locations: optimizedLocations };
    }));

    // Debug payload size before sending
    const payloadSize = (JSON.stringify({ projectName, evidenceData: optimizedEvidence }).length / 1024 / 1024).toFixed(2);
    console.log(`Payload size (optimized): ${payloadSize} MB`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

    const response = await fetch('/api/reports/executive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectName, evidenceData: optimizedEvidence }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error('El reporte es demasiado grande (muchas fotos). Intente reducir el rango de fechas.');
      }
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error || 'Failed to generate PDF');
      } catch (e: any) {
        throw new Error(e.message === 'Failed to generate PDF' ? e.message : `Server Error: ${response.status} ${response.statusText}`);
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Ejecutivo_${projectName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error: any) {
    console.error('Executive PDF Error:', error);
    if (error.name === 'AbortError') {
      alert('La generación del reporte tardó demasiado. Intente con menos ítems.');
    } else {
      alert(`Error al generar el reporte ejecutivo: ${error.message}`);
    }
  }
};

import { NewsReportItem } from '@/components/reports/NewsReportTemplate';

export const generateNewsPDF = async (projectName: string, incidents: NewsReportItem[]) => {
  try {
    // Compress images before sending
    const optimizedIncidents = await Promise.all(incidents.map(async (item) => {
      let optimizedPhoto = item.photo;
      if (item.photo && item.photo.startsWith('data:image')) {
        try {
          optimizedPhoto = await compressImage(item.photo, 1024, 0.7);
        } catch (err) {
          console.error('Failed to compress image:', err);
        }
      }
      return { ...item, photo: optimizedPhoto };
    }));

    // Debug payload size before sending
    const payloadSize = (JSON.stringify({ projectName, incidents: optimizedIncidents }).length / 1024 / 1024).toFixed(2);
    console.log(`News Report Payload size (optimized): ${payloadSize} MB`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

    const response = await fetch('/api/reports/news', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectName, incidents: optimizedIncidents }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error('El reporte es demasiado grande. Intente filtrar las incidencias.');
      }
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.details || errorData.error || 'Failed to generate PDF');
      } catch (e: any) {
        throw new Error(e.message === 'Failed to generate PDF' ? e.message : e.message);
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Novedades_${projectName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error: any) {
    console.error('News PDF Error:', error);
    if (error.name === 'AbortError') {
      alert('La generación del reporte tardó demasiado.');
    } else {
      alert(`Error al generar el reporte de novedades: ${error.message}`);
    }
  }
};
