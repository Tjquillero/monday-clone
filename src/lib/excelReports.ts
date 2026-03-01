import * as XLSX from 'xlsx';
import { Item, Column } from '@/types/monday';

export const generateExcelReport = (boardName: string, items: Item[], columns: Column[]) => {
  try {
    // 1. Prepare Header Row
    const headers = [
      'ID',
      'Tipo',
      'Item Padre',
      'Nombre',
      ...columns.map(c => c.title)
    ];

    // 2. Prepare Data Rows
    const rows: any[] = [];

    items.forEach(item => {
      // Parent Item Row
      const parentRow = [
        item.id,
        'Actividad Principal',
        '-',
        item.name,
        ...columns.map(col => getItemValue(item, col))
      ];
      rows.push(parentRow);

      // Sub-items Rows
      if (item.subItems && item.subItems.length > 0) {
        item.subItems.forEach(sub => {
          const subRow = [
            sub.id,
            'Sub-item',
            item.name,
            sub.name,
            ...columns.map(col => getItemValue(sub, col))
          ];
          rows.push(subRow);
        });
      }
    });

    // 3. Create Worksheet
    const worksheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // 4. Create Workbook and Append Worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte de Sitio");

    // 5. Generate Excel File
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Reporte_${boardName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;
    
    XLSX.writeFile(wb, fileName);

  } catch (error) {
    console.error('Excel Generation Error:', error);
    alert('Error al generar el reporte de Excel.');
  }
};

// Helper to safely extract values based on column type
const getItemValue = (item: Item, col: Column) => {
  const val = item.values[col.id];
  if (val === undefined || val === null) return '';

  // Handle specific logic like formulas if needed, otherwise return value
  // Ideally this mirrors the getColValue logic in BoardView but simplified for raw data
  return val;
};
