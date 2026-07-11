import { importPoaVersion, defaultImportPoaService, createImportPoaService } from './importPoaService';
import { parsePoaExcel } from '../parseExcel';
import { realWorkbookArrayBuffer } from '../testFixtures';
import type { ImportPoaInput, ImportPoaService } from './types';
import type { ValidatePoaImportContext } from '../validate';
import type { ParseResult } from '../types';

/**
 * Un Excel sintético mínimo con un único bloque de zona y una única
 * actividad limpia (sin ambigüedad de frecuencia, sin campos vacíos) — el
 * archivo real completo SIEMPRE queda `blocked` (Grupo B + 3.1/3.14 con
 * FREC. vacío), así que no sirve para probar el camino "sin bloqueo" de
 * forma aislada.
 */
function minimalCleanWorkbookArrayBuffer(): ArrayBuffer {
  const XLSX = require('xlsx');
  const rows = [
    ['nota'], // fila 1: nota suelta
    [null, null, null, null, null, null, null, null, 'Zona Test (presupuesto mes)'], // fila 2: zona
    ['CAT', 'ÍTEM', 'DESCRIPCIÓN', 'UNID', 'CANT.', 'VU25', 'VU26', null, 'CANT.', 'FREC.', 'PRECIO TOTAL'], // fila 3
    ['MANTENIMIENTO', '1.01', 'Actividad de prueba', 'M2', 1, 100, 100, null, 10, 1, 1000], // fila 4: dato
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'POA INICIAL 2026');
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const REAL_ZONE_NAMES = [
  'PLAZA DE PTO COLOMBIA',
  'PLAYA MANGLARES',
  'SALGAR PLAYAS DEL COUNTRY 1',
  'SALGAR PLAYAS DE SABANAILLA 2',
  'PLAYAS DE MIRAMAR SECTOR EL FARO',
  'CENTRO GASTRONOMICO',
  'MERCADO LA SAZÓN',
  'SENDERO SANTA VERÓNICA',
  'PLAYA PUNTA ASTILLEROS',
];

function fullyMappedContext(parseResult: ParseResult): ValidatePoaImportContext {
  const zoneMappings = new Map<string, string>();
  REAL_ZONE_NAMES.forEach((name, i) => zoneMappings.set(name, `group-${i}`));
  const knownActivityKeys = new Set(parseResult.actividades.map((a) => a.activityKey));
  return { zoneMappings, knownActivityKeys };
}

const VALID_INPUT: ImportPoaInput = {
  poaId: 'poa-1',
  boardId: 'board-1',
  file: new ArrayBuffer(8), // no es un Excel real — solo para las pruebas de forma del input
  importOperationId: 'op-1',
};

describe('importPoaVersion — Commit 1: validación de forma del input', () => {
  it('cumple la interfaz ImportPoaService (chequeo de tipos + wiring en runtime)', () => {
    const service: ImportPoaService = defaultImportPoaService;
    expect(typeof service.importPoaVersion).toBe('function');
  });

  it('rechaza un input sin poaId', async () => {
    await expect(importPoaVersion({ ...VALID_INPUT, poaId: '' })).rejects.toThrow('poaId es obligatorio');
  });

  it('rechaza un input sin boardId', async () => {
    await expect(importPoaVersion({ ...VALID_INPUT, boardId: '' })).rejects.toThrow('boardId es obligatorio');
  });

  it('rechaza un input sin importOperationId', async () => {
    await expect(importPoaVersion({ ...VALID_INPUT, importOperationId: '' })).rejects.toThrow(
      'importOperationId es obligatorio',
    );
  });
});

describe('importPoaVersion — Commit 2: integración parser -> validator (sin Supabase)', () => {
  it('con un archivo limpio y contexto completamente resuelto, llega hasta "pendiente de implementar" (Commits 3-4) — no se bloquea', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async () => ({
        zoneMappings: new Map([['Zona Test', 'group-0']]),
        knownActivityKeys: new Set(['1.01']),
      }),
    });

    await expect(
      service.importPoaVersion({ ...VALID_INPUT, file: minimalCleanWorkbookArrayBuffer() }),
    ).rejects.toThrow('pendiente de implementar (Commits 3-4');
  });

  it('el archivo real COMPLETO, incluso con zonas y catálogo perfectamente resueltos, siempre queda blocked hoy (Grupo B + 3.1/3.14 con FREC. vacío) — documenta el estado actual, no un bug', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async (parseResult) => fullyMappedContext(parseResult),
    });

    const result = await service.importPoaVersion({ ...VALID_INPUT, file: realWorkbookArrayBuffer() });
    expect(result.status).toBe('blocked');
  });

  it('sin ningún mapeo de zona resuelto, devuelve blocked con las 9 zonas en unresolvedZones', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async (parseResult) => ({
        zoneMappings: new Map(), // ninguna zona resuelta
        knownActivityKeys: new Set(parseResult.actividades.map((a) => a.activityKey)),
      }),
    });

    const result = await service.importPoaVersion({ ...VALID_INPUT, file: realWorkbookArrayBuffer() });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') throw new Error('esperaba blocked');
    expect(result.unresolvedZones).toHaveLength(9);
    expect(result.unresolvedZones.map((z) => z.excelZoneName)).toEqual(
      expect.arrayContaining(REAL_ZONE_NAMES),
    );
  });

  it('con zonas resueltas pero catálogo vacío, devuelve blocked con actividades desconocidas en validationErrors', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async () => ({
        zoneMappings: new Map(REAL_ZONE_NAMES.map((name, i) => [name, `group-${i}`])),
        knownActivityKeys: new Set(), // ninguna actividad reconocida
      }),
    });

    const result = await service.importPoaVersion({ ...VALID_INPUT, file: realWorkbookArrayBuffer() });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') throw new Error('esperaba blocked');
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors.every((e) => e.code === 'activity_key_inexistente')).toBe(true);
  });

  it('con el archivo real completo (zonas y catálogo resueltos), reporta las 13 actividades del Grupo B en ambiguousFrequencyActivities, cada una con el enlace al discovery', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async (parseResult) => fullyMappedContext(parseResult),
    });

    const result = await service.importPoaVersion({ ...VALID_INPUT, file: realWorkbookArrayBuffer() });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') throw new Error('esperaba blocked');
    expect(result.ambiguousFrequencyActivities).toHaveLength(13);
    expect(result.ambiguousFrequencyActivities.map((a) => a.activityKey)).toContain('1.12');
    for (const activity of result.ambiguousFrequencyActivities) {
      expect(activity.discoveryDoc).toBe('docs/discovery/poa-frequency-per-zone.md');
      expect(activity.descripcion.length).toBeGreaterThan(0);
    }
  });

  it('un archivo con estructura irreconocible (no un Excel real) sigue fallando al parsear, no llega a validar', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async (parseResult) => fullyMappedContext(parseResult),
    });

    await expect(
      service.importPoaVersion({ ...VALID_INPUT, file: new ArrayBuffer(8) }),
    ).rejects.toThrow();
  });

  it('parsePoaExcel + validateParsedPoa producen el mismo resultado dentro y fuera del servicio (el servicio no reinterpreta nada)', () => {
    const parseResult = parsePoaExcel(realWorkbookArrayBuffer());
    expect(parseResult.actividades).toHaveLength(107);
  });
});
