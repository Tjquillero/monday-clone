import { parseResourceAnalysisExcel } from './parseExcel';
import { validateResourceAnalysis } from './validate';
import { realWorkbookArrayBuffer } from './testFixtures';
import type { ParseResult } from './types';

describe('validateResourceAnalysis — archivo real, sin mapeo de sitios (estado actual del sistema)', () => {
  const parsed = parseResourceAnalysisExcel(realWorkbookArrayBuffer());
  const result = validateResourceAnalysis(parsed, { siteMappings: new Map() });

  it('isValid=false porque ningún bloque tiene sitio resuelto todavía (RA002 en los 15 bloques)', () => {
    expect(result.isValid).toBe(false);
    expect(result.errors.filter((e) => e.code === 'RA002')).toHaveLength(15);
  });

  it('summary refleja 9 hojas / 15 bloques, todos bloqueados por RA002', () => {
    expect(result.summary).toEqual({
      totalSheets: 9,
      totalBlocks: 15,
      validBlocks: 0,
      blockedBlocks: 15,
    });
  });

  it('RA006/RA007 (rendimiento/frecuencia informativos) aparecen en los 15 bloques — todos traen esas columnas', () => {
    expect(result.warnings.filter((w) => w.code === 'RA006')).toHaveLength(15);
    expect(result.warnings.filter((w) => w.code === 'RA007')).toHaveLength(15);
  });

  it('RA003 (descripción no reconocida) reclasifica los 3 warnings del parser ("ARBOLES FUERA DE CAMASIEMBRA")', () => {
    const ra003 = result.warnings.filter((w) => w.code === 'RA003');
    expect(ra003).toHaveLength(3);
    expect(ra003.every((w) => w.detalle === 'ARBOLES FUERA DE CAMASIEMBRA')).toBe(true);
  });

  it('no reporta RA001, RA004 ni RA005 (no ocurren en el archivo real)', () => {
    expect(result.errors.filter((e) => e.code === 'RA001')).toHaveLength(0);
    expect(result.errors.filter((e) => e.code === 'RA004')).toHaveLength(0);
    expect(result.errors.filter((e) => e.code === 'RA005')).toHaveLength(0);
  });
});

describe('validateResourceAnalysis — archivo real, con las 15 hojas mapeadas a un sitio', () => {
  it('isValid=true y los 15 bloques quedan válidos cuando cada uno tiene un sitio resuelto distinto', () => {
    const parsed = parseResourceAnalysisExcel(realWorkbookArrayBuffer());
    const siteMappings = new Map<string, string>();
    let n = 0;
    for (const sheet of parsed.sheets) {
      sheet.blocks.forEach((_, blockIndex) => {
        siteMappings.set(`${sheet.sheetName}#${blockIndex}`, `site-${n++}`);
      });
    }
    const result = validateResourceAnalysis(parsed, { siteMappings });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.validBlocks).toBe(15);
    expect(result.summary.blockedBlocks).toBe(0);
    // RA006/RA007 son informativos — isValid=true no implica ausencia de warnings.
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateResourceAnalysis — casos sintéticos (no ocurren en el archivo real)', () => {
  function emptyParseResult(): ParseResult {
    return { sheets: [], warnings: [] };
  }

  it('RA001: hoja sin ningún bloque reconocible', () => {
    const parsed: ParseResult = {
      sheets: [{ sheetName: 'HOJA VACIA', blocks: [] }],
      warnings: [],
    };
    const result = validateResourceAnalysis(parsed, { siteMappings: new Map() });
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('RA001');
    expect(result.errors[0].sheetName).toBe('HOJA VACIA');
    // Una hoja sin bloques no contribuye a totalBlocks.
    expect(result.summary).toEqual({ totalSheets: 1, totalBlocks: 0, validBlocks: 0, blockedBlocks: 0 });
  });

  it('RA005: dos bloques del mismo sitio que comparten scopeKey (riesgo real: importar la misma cantidad dos veces)', () => {
    const parsed: ParseResult = {
      sheets: [
        {
          sheetName: 'SITIO DUPLICADO',
          blocks: [
            {
              blockLabel: 'BLOQUE A',
              excelRow: 1,
              quantities: [{ scopeKey: 'corte_troncos', cantidad: 350, excelRow: 2 }],
              activityStandardsRaw: [],
            },
            {
              blockLabel: 'BLOQUE B (repite corte_troncos del bloque A)',
              excelRow: 30,
              quantities: [{ scopeKey: 'corte_troncos', cantidad: 999, excelRow: 31 }],
              activityStandardsRaw: [],
            },
          ],
        },
      ],
      warnings: [],
    };
    const siteMappings = new Map([
      ['SITIO DUPLICADO#0', 'sitio-x'],
      ['SITIO DUPLICADO#1', 'sitio-x'], // mismo sitio Y mismo scopeKey que el bloque 0 — duplicado real
    ]);
    const result = validateResourceAnalysis(parsed, { siteMappings });
    expect(result.isValid).toBe(false);
    const ra005 = result.errors.filter((e) => e.code === 'RA005');
    expect(ra005).toHaveLength(1);
    expect(ra005[0].blockIndex).toBe(1);
    expect(ra005[0].detalle).toBe('sitio-x');
    // El primer bloque (que sí resolvió limpio) no queda marcado con error.
    expect(result.summary.blockedBlocks).toBe(1);
    expect(result.summary.validBlocks).toBe(1);
  });

  it('RA005 NO dispara cuando dos bloques del mismo sitio NO comparten scopeKey (caso normal: Zona Verde + Zona de Playa)', () => {
    const parsed: ParseResult = {
      sheets: [
        {
          sheetName: 'SITIO NORMAL',
          blocks: [
            {
              blockLabel: 'SITIO NORMAL - ZONA VERDE',
              excelRow: 1,
              quantities: [{ scopeKey: 'arbustos', cantidad: 100, excelRow: 2 }],
              activityStandardsRaw: [],
            },
            {
              blockLabel: 'SITIO NORMAL - ZONA DE PLAYA',
              excelRow: 30,
              quantities: [{ scopeKey: 'corte_troncos', cantidad: 350, excelRow: 31 }],
              activityStandardsRaw: [],
            },
          ],
        },
      ],
      warnings: [],
    };
    const siteMappings = new Map([
      ['SITIO NORMAL#0', 'sitio-y'],
      ['SITIO NORMAL#1', 'sitio-y'], // mismo sitio, pero scopeKey distinto — no es duplicado
    ]);
    const result = validateResourceAnalysis(parsed, { siteMappings });
    expect(result.isValid).toBe(true);
    expect(result.errors.filter((e) => e.code === 'RA005')).toHaveLength(0);
    expect(result.summary).toEqual({ totalSheets: 1, totalBlocks: 2, validBlocks: 2, blockedBlocks: 0 });
  });

  it('RA004: cantidad negativa reportada por el parser se reclasifica como error (bloquea isValid)', () => {
    const parsed: ParseResult = {
      sheets: [
        {
          sheetName: 'SITIO X',
          blocks: [{ blockLabel: 'SITIO X - ZONA VERDE', excelRow: 1, quantities: [], activityStandardsRaw: [] }],
        },
      ],
      warnings: [{ tipo: 'cantidad_negativa', sheetName: 'SITIO X', excelRow: 5, detalle: 'ZONA DURA: -100' }],
    };
    const result = validateResourceAnalysis(parsed, { siteMappings: new Map([['SITIO X#0', 'sitio-x']]) });
    expect(result.isValid).toBe(false);
    expect(result.errors.filter((e) => e.code === 'RA004')).toHaveLength(1);
  });

  it('0 hojas → summary en cero, isValid=true (nada que reportar no es un error)', () => {
    const result = validateResourceAnalysis(emptyParseResult(), { siteMappings: new Map() });
    expect(result.isValid).toBe(true);
    expect(result.summary).toEqual({ totalSheets: 0, totalBlocks: 0, validBlocks: 0, blockedBlocks: 0 });
  });
});
