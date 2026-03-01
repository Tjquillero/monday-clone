import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Item, Column } from '@/types/monday';

// Extend jsPDF with autotable types
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

const getBase64Image = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading image for PDF:', error);
    return '';
  }
};

export const generateItemPDF = async (item: Item, columns: Column[], evidence: any[] = []) => {
  const doc = new jsPDF() as jsPDFWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header - Brand / Title
  doc.setFillColor(36, 97, 75); // Mantenix Emerald
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('MANTENIX', 15, 18);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('REPORTE DE ACTIVIDAD DE CAMPO', 15, 28);
  
  // Right side header info
  doc.setFontSize(8);
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - 15, 15, { align: 'right' });
  doc.text(`ID: ${String(item.id).slice(0, 8)}`, pageWidth - 15, 22, { align: 'right' });

  // Main Content
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(item.name, 15, 55);

  // Metadata Grid (Table style)
  const metaData = [
    ['Estado', item.values['status'] || 'N/A'],
    ['Responsable', item.values['person'] || 'Desconocido'],
    ['Fecha Planeada', item.values['date'] || 'N/A'],
    ['Categoría', item.values['category'] || 'N/A']
  ];

  doc.autoTable({
    startY: 65,
    head: [['Campo', 'Valor']],
    body: metaData,
    theme: 'grid',
    headStyles: { fillStyle: 'emerald', fillColor: [36, 97, 75] },
    margin: { left: 15, right: 15 }
  });

  // Description Section
  let lastY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Descripción de la Actividad', 15, lastY);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const splitDescription = doc.splitTextToSize(item.description || 'Sin descripción detallada registrada.', pageWidth - 30);
  doc.text(splitDescription, 15, lastY + 7);
  
  lastY = lastY + 15 + (splitDescription.length * 5);

  // Evidence Photos
  if (evidence.length > 0) {
    if (lastY > 230) { doc.addPage(); lastY = 20; }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Evidencia Fotográfica', 15, lastY);
    lastY += 10;

    const imgWidth = (pageWidth - 40) / 2;
    const imgHeight = 60;
    let currentX = 15;

    for (const [index, ev] of evidence.entries()) {
      if (lastY + imgHeight > 280) {
        doc.addPage();
        lastY = 20;
      }

      const base64 = await getBase64Image(ev.url);
      if (base64) {
        try {
            doc.addImage(base64, 'JPEG', currentX, lastY, imgWidth, imgHeight);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`${new Date(ev.timestamp).toLocaleString()}`, currentX, lastY + imgHeight + 5);
        } catch (e) {
            console.error('PDF Image Error:', e);
        }
      }

      if (index % 2 === 0) {
        currentX = pageWidth / 2 + 5;
      } else {
        currentX = 15;
        lastY += imgHeight + 15;
      }
    }
  }

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(180);
    doc.text(`Generado automáticamente por Mantenix • Página ${i} de ${totalPages}`, pageWidth / 2, 290, { align: 'center' });
  }

  doc.save(`Reporte-${item.name.replace(/\s+/g, '_')}.pdf`);
};
