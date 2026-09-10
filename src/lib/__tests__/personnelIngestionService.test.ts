import {
  normalizeCedula,
  EXCEL_SITE_TO_GROUP_TITLE,
  parsePersonnelExcel,
} from '../personnelIngestionService';
import path from 'path';

describe('Contrato Técnico de Ingestión de Personal v1 (Unit Tests)', () => {
  describe('1. Normalización Canónica de Cédula (normalizeCedula)', () => {
    it('debe mantener números de cédula numéricos limpios', () => {
      expect(normalizeCedula(7427635)).toBe('7427635');
      expect(normalizeCedula(' 72309823 ')).toBe('72309823');
    });

    it('debe normalizar canónicamente identidades PPT preservando el prefijo', () => {
      expect(normalizeCedula('PPT-5435519')).toBe('PPT-5435519');
      expect(normalizeCedula('PPT- 5435519 ')).toBe('PPT-5435519');
    });

    it('debe normalizar canónicamente identidades PT eliminando espacios internos', () => {
      expect(normalizeCedula('PT- 5251280')).toBe('PT-5251280');
      expect(normalizeCedula(' PT-  5251280 ')).toBe('PT-5251280');
    });

    it('debe retornar cadena vacía para valores nulos o vacíos', () => {
      expect(normalizeCedula(null)).toBe('');
      expect(normalizeCedula(undefined)).toBe('');
      expect(normalizeCedula('   ')).toBe('');
    });
  });

  describe('2. Catálogo Cerrado de Resolución de Sitio (EXCEL_SITE_TO_GROUP_TITLE)', () => {
    it('debe mapear exactamente los 8 sub-centros operativos sin heurísticas difusas', () => {
      expect(EXCEL_SITE_TO_GROUP_TITLE['PLAZA PUERTO COLOMBIA']).toBe('PLAZA PUERTO COLOMBIA');
      expect(EXCEL_SITE_TO_GROUP_TITLE['PLAYA MANGLARES']).toBe('MANGLARES');
      expect(EXCEL_SITE_TO_GROUP_TITLE['CENTRO GASTRONOMICO']).toBe('MERCADO LA SAZÓN');
      expect(EXCEL_SITE_TO_GROUP_TITLE['PLAYA MIRAMAR']).toBe('MIRAMAR SECTOR EL FARO');
      expect(EXCEL_SITE_TO_GROUP_TITLE['COUNTRY 1']).toBe('PLAYA DEL COUNTRY');
      expect(EXCEL_SITE_TO_GROUP_TITLE['COUNTRY 2']).toBe('PLAYA DE SABANILLA 2');
      expect(EXCEL_SITE_TO_GROUP_TITLE['SALINAS DEL REY']).toBe('SALINAS DEL REY');
      expect(EXCEL_SITE_TO_GROUP_TITLE['SENDERO SANTA VERONICA']).toBe('SENDERO SANTA VERÓNICA');
    });

    it('debe retornar undefined para sub-centros no registrados en el catálogo', () => {
      expect(EXCEL_SITE_TO_GROUP_TITLE['SITIO DESCONOCIDO']).toBeUndefined();
    });
  });

  describe('3. Lectura de Archivo Fuente Excel (parsePersonnelExcel)', () => {
    it('debe parsear las 52 filas operativas del Excel real sin alterar nombres ni identidades', () => {
      const excelPath = path.join(process.cwd(), 'BASE DE DATOS DEL PERSONAL CON CENTRO DE COSTO ACTULIZADA.xlsx');
      const rows = parsePersonnelExcel(excelPath);
      expect(rows.length).toBe(52);

      const teran = rows.find((r) => r.cedula === '7427635');
      expect(teran).toBeDefined();
      expect(teran?.nombre).toBe('CESAR AUGUSTO TERAN CASTELLAR');
      expect(teran?.sitioExcel).toBe('PLAZA PUERTO COLOMBIA');
    });
  });
});
