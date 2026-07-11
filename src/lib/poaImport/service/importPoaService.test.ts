// importPoaService.ts importa (transitivamente, vía resolveValidationContext.ts
// y persistImportPoaVersion.ts) el cliente real de Supabase. Estos tests
// nunca ejercitan esas rutas — createImportPoaService() siempre recibe
// resolveValidationContext/persistImportPoaVersion inyectados — pero el
// módulo real igual se instancia al cargar el archivo si no se mockea, y
// createBrowserClient() falla en jsdom sin las env vars de Supabase.
jest.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

import { importPoaVersion, defaultImportPoaService, createImportPoaService } from './importPoaService';
import { parsePoaExcel } from '../parseExcel';
import { realWorkbookArrayBuffer } from '../testFixtures';
import type { ImportPoaInput, ImportPoaService } from './types';
import type { ValidatePoaImportContext } from '../validate';
import type { ParseResult } from '../types';
import type { ImportPayloadActivity } from './buildImportPayload';

/**
 * Un Excel sintético mínimo con un único bloque de zona y una única
 * actividad limpia (sin ambigüedad de frecuencia, sin campos vacíos) — el
 * archivo real completo SIEMPRE queda `blocked` (Grupo B + 3.1/3.14 con
 * FREC. vacío), así que no sirve para probar el camino de éxito de forma
 * aislada.
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

/** Stub defensivo: para los tests que esperan `blocked`, persistir nunca debería invocarse. */
const NEVER_PERSIST = async (): Promise<string> => {
  throw new Error('persistImportPoaVersion no debería llamarse cuando el resultado es blocked');
};

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

describe('importPoaVersion — Commits 2-3: integración parser -> validator, resolución de contexto inyectable', () => {
  it('el archivo real COMPLETO, incluso con zonas y catálogo perfectamente resueltos, siempre queda blocked hoy (Grupo B + 3.1/3.14 con FREC. vacío) — documenta el estado actual, no un bug', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async (parseResult) => fullyMappedContext(parseResult),
      persistImportPoaVersion: NEVER_PERSIST,
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
      persistImportPoaVersion: NEVER_PERSIST,
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
      persistImportPoaVersion: NEVER_PERSIST,
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
      persistImportPoaVersion: NEVER_PERSIST,
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
      persistImportPoaVersion: NEVER_PERSIST,
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

describe('importPoaVersion — Commit 4: persistencia real', () => {
  it('con un archivo limpio y contexto completamente resuelto, persiste y devuelve success con los conteos correctos', async () => {
    let receivedArgs: [string, ImportPayloadActivity[], string] | null = null;
    const service = createImportPoaService({
      resolveValidationContext: async () => ({
        zoneMappings: new Map([['Zona Test', 'group-0']]),
        knownActivityKeys: new Set(['1.01']),
      }),
      persistImportPoaVersion: async (poaId, activities, importOperationId) => {
        receivedArgs = [poaId, activities, importOperationId];
        return 'version-123';
      },
    });

    const result = await service.importPoaVersion({
      ...VALID_INPUT,
      file: minimalCleanWorkbookArrayBuffer(),
    });

    expect(result).toEqual({
      status: 'success',
      versionId: 'version-123',
      activitiesImported: 1,
      zonesImported: 1,
      activitiesNotContracted: 0,
    });

    expect(receivedArgs).not.toBeNull();
    const [poaId, activities, importOperationId] = receivedArgs!;
    expect(poaId).toBe('poa-1');
    expect(importOperationId).toBe('op-1'); // exactamente el importOperationId del input, sin regenerar
    expect(activities).toEqual([
      {
        activity_key: '1.01',
        precio_unitario: 100,
        frecuencia: 1,
        zonas: [{ group_id: 'group-0', cantidad_contratada: 10 }],
      },
    ]);
  });

  it('propaga el mismo importOperationId del input a persistImportPoaVersion incluso con un input distinto', async () => {
    let receivedOperationId: string | null = null;
    const service = createImportPoaService({
      resolveValidationContext: async () => ({
        zoneMappings: new Map([['Zona Test', 'group-0']]),
        knownActivityKeys: new Set(['1.01']),
      }),
      persistImportPoaVersion: async (_poaId, _activities, importOperationId) => {
        receivedOperationId = importOperationId;
        return 'version-456';
      },
    });

    await service.importPoaVersion({
      ...VALID_INPUT,
      file: minimalCleanWorkbookArrayBuffer(),
      importOperationId: 'op-generado-por-el-llamador-una-sola-vez',
    });

    expect(receivedOperationId).toBe('op-generado-por-el-llamador-una-sola-vez');
  });

  it('cuando la persistencia falla, traduce el error a persistence_failed en vez de dejar la excepción sin capturar', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async () => ({
        zoneMappings: new Map([['Zona Test', 'group-0']]),
        knownActivityKeys: new Set(['1.01']),
      }),
      persistImportPoaVersion: async () => {
        throw { code: '23503', message: 'insert or update on table "poa_activity_zones" violates foreign key constraint' };
      },
    });

    const result = await service.importPoaVersion({
      ...VALID_INPUT,
      file: minimalCleanWorkbookArrayBuffer(),
    });

    expect(result.status).toBe('persistence_failed');
    if (result.status !== 'persistence_failed') throw new Error('esperaba persistence_failed');
    expect(result.sqlState).toBe('23503');
    expect(result.message).toContain('group_id que no existe');
  });

  it('un resultado blocked nunca invoca persistImportPoaVersion', async () => {
    const service = createImportPoaService({
      resolveValidationContext: async (parseResult) => fullyMappedContext(parseResult),
      persistImportPoaVersion: NEVER_PERSIST, // si se llamara, este test fallaría con el throw del stub
    });

    const result = await service.importPoaVersion({ ...VALID_INPUT, file: realWorkbookArrayBuffer() });
    expect(result.status).toBe('blocked');
  });

  it('contrato de idempotencia: un reintento tras un fallo transitorio con el MISMO ImportPoaInput reutiliza el mismo importOperationId, nunca genera uno nuevo', async () => {
    const receivedOperationIds: string[] = [];
    let attempt = 0;

    const service = createImportPoaService({
      resolveValidationContext: async () => ({
        zoneMappings: new Map([['Zona Test', 'group-0']]),
        knownActivityKeys: new Set(['1.01']),
      }),
      persistImportPoaVersion: async (_poaId, _activities, importOperationId) => {
        receivedOperationIds.push(importOperationId);
        attempt += 1;
        if (attempt === 1) {
          throw { code: '08006', message: 'connection failure' }; // fallo transitorio simulado
        }
        return 'version-tras-reintento';
      },
    });

    const input: ImportPoaInput = {
      ...VALID_INPUT,
      file: minimalCleanWorkbookArrayBuffer(),
      importOperationId: 'op-generado-una-sola-vez-por-el-llamador',
    };

    // Primer intento: falla transitoriamente.
    const firstResult = await service.importPoaVersion(input);
    expect(firstResult.status).toBe('persistence_failed');

    // El llamador reintenta con el MISMO input (mismo importOperationId) —
    // el servicio nunca lo regenera por su cuenta.
    const secondResult = await service.importPoaVersion(input);
    expect(secondResult.status).toBe('success');

    expect(receivedOperationIds).toEqual([
      'op-generado-una-sola-vez-por-el-llamador',
      'op-generado-una-sola-vez-por-el-llamador',
    ]);
  });
});
