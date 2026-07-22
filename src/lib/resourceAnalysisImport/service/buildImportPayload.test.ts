import { parseResourceAnalysisExcel } from '../parseExcel';
import { validateResourceAnalysis } from '../validate';
import { realWorkbookArrayBuffer } from '../testFixtures';
import { RESOURCE_ANALYSIS_SITE_MAPPINGS } from '../siteMappings';
import { buildImportPayload } from './buildImportPayload';
import type { ParseResult, ValidationResult } from '../types';

describe('buildImportPayload — archivo real con el mapeo congelado', () => {
  const parsed = parseResourceAnalysisExcel(realWorkbookArrayBuffer());
  const validation = validateResourceAnalysis(parsed, { siteMappings: RESOURCE_ANALYSIS_SITE_MAPPINGS });
  const payload = buildImportPayload(parsed, validation, RESOURCE_ANALYSIS_SITE_MAPPINGS);

  it('produce exactamente 9 sitios (15 bloques combinados por group_id), 0 salteados', () => {
    expect(payload.toUpsert).toHaveLength(9);
    expect(payload.skipped).toHaveLength(0);
  });

  it('PLAYA DEL COUNTRY combina Zona Verde + Zona de Playa en un único scope_data de 8 claves', () => {
    const country = payload.toUpsert.find((s) => s.groupId === '6366520a-d981-4c7c-8d4d-72fbf06bb7f3')!;
    expect(country.sheetNames).toEqual(['COUNTRY 1']);
    expect(Object.keys(country.scopeData)).toHaveLength(8);
    expect(country.scopeData.corte_troncos).toBe(350);
    expect(country.scopeData.arbustos).toBe(2295);
  });

  it('COUNTRY 2 (Playa de Sabanilla 2) trae cantidades propias, no una copia de COUNTRY 1', () => {
    const sabanilla = payload.toUpsert.find((s) => s.groupId === 'a59b5a16-30f1-4e83-aa68-342d791e2d97')!;
    expect(sabanilla.scopeData.zona_playa).toBe(18070);
    expect(sabanilla.scopeData.trasiego_playa).toBe(9035);
  });

  it('sitios sin frente de playa (Centro Gastronómico, Mercado, Miramar, Santa Verónica) solo traen las claves de Zona Verde', () => {
    const sinPlaya = ['e45851b6-73f7-46ad-b6dd-ea4f5920d747', '55d65880-8a87-4c7d-be45-0d26821194cc', '0230dceb-1ea2-4273-9a44-a5ff19da7ad9', '0b846b6a-e9f7-4df4-a2ac-89fcefab164d'];
    for (const groupId of sinPlaya) {
      const site = payload.toUpsert.find((s) => s.groupId === groupId)!;
      expect(site.scopeData.corte_troncos).toBeUndefined();
      expect(site.scopeData.zona_playa).toBeUndefined();
    }
  });
});

describe('buildImportPayload — casos sintéticos de bloqueo', () => {
  it('bloque sin sitio resuelto (RA002) se saltea con groupId null', () => {
    const parsed: ParseResult = {
      sheets: [{ sheetName: 'HOJA X', blocks: [{ blockLabel: 'X', excelRow: 1, quantities: [{ scopeKey: 'arbustos', cantidad: 10, excelRow: 2 }], activityStandardsRaw: [] }] }],
      warnings: [],
    };
    const validation: ValidationResult = {
      isValid: false,
      errors: [{ code: 'RA002', message: 'sin sitio', sheetName: 'HOJA X', blockIndex: 0 }],
      warnings: [],
      summary: { totalSheets: 1, totalBlocks: 1, validBlocks: 0, blockedBlocks: 1 },
    };
    const payload = buildImportPayload(parsed, validation, new Map());
    expect(payload.toUpsert).toHaveLength(0);
    expect(payload.skipped).toHaveLength(1);
    expect(payload.skipped[0].groupId).toBeNull();
  });

  it('sitio con un bloque válido y otro bloqueado (RA005) NO se importa parcialmente — se saltea completo', () => {
    const parsed: ParseResult = {
      sheets: [
        {
          sheetName: 'HOJA Y',
          blocks: [
            { blockLabel: 'Y - ZONA VERDE', excelRow: 1, quantities: [{ scopeKey: 'arbustos', cantidad: 10, excelRow: 2 }], activityStandardsRaw: [] },
            { blockLabel: 'Y - ZONA DE PLAYA', excelRow: 30, quantities: [{ scopeKey: 'corte_troncos', cantidad: 99, excelRow: 31 }], activityStandardsRaw: [] },
          ],
        },
      ],
      warnings: [],
    };
    const siteMappings = new Map([
      ['HOJA Y#0', 'sitio-y'],
      ['HOJA Y#1', 'sitio-y'],
    ]);
    const validation: ValidationResult = {
      isValid: false,
      errors: [{ code: 'RA005', message: 'duplicado', sheetName: 'HOJA Y', blockIndex: 1 }],
      warnings: [],
      summary: { totalSheets: 1, totalBlocks: 2, validBlocks: 1, blockedBlocks: 1 },
    };
    const payload = buildImportPayload(parsed, validation, siteMappings);
    // El sitio completo queda fuera de toUpsert -- no se persiste solo el bloque 0.
    expect(payload.toUpsert.find((s) => s.groupId === 'sitio-y')).toBeUndefined();
    expect(payload.skipped.some((s) => s.groupId === 'sitio-y')).toBe(true);
  });

  it('hoja con error a nivel de archivo (RA001) no aporta ningún sitio', () => {
    const parsed: ParseResult = { sheets: [{ sheetName: 'HOJA VACIA', blocks: [] }], warnings: [] };
    const validation: ValidationResult = {
      isValid: false,
      errors: [{ code: 'RA001', message: 'sin bloques', sheetName: 'HOJA VACIA' }],
      warnings: [],
      summary: { totalSheets: 1, totalBlocks: 0, validBlocks: 0, blockedBlocks: 0 },
    };
    const payload = buildImportPayload(parsed, validation, new Map());
    expect(payload.toUpsert).toHaveLength(0);
    expect(payload.skipped).toHaveLength(1);
  });
});
