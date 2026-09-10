import { parsePersonnelExcel, EXCEL_SITE_TO_GROUP_TITLE } from '../personnelIngestionService';
import path from 'path';

describe('Debug parsePersonnelExcel sitios', () => {
  it('debe mostrar los sitios extraídos del Excel', () => {
    const excelPath = path.join(process.cwd(), 'BASE DE DATOS DEL PERSONAL CON CENTRO DE COSTO ACTULIZADA.xlsx');
    const rows = parsePersonnelExcel(excelPath);
    console.log('Total filas leídas:', rows.length);

    const siteCounts: Record<string, number> = {};
    rows.forEach((r) => {
      const site = r.sitioExcel;
      siteCounts[site] = (siteCounts[site] || 0) + 1;
    });

    console.log('Sitios extraídos y conteos:', siteCounts);

    Object.keys(siteCounts).forEach((site) => {
      const mapped = EXCEL_SITE_TO_GROUP_TITLE[site.toUpperCase().trim()];
      console.log(`Excel Site: "${site}" -> Mapped Title: "${mapped}"`);
    });
  });
});
