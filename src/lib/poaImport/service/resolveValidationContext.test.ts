import type { ParseResult } from '../types';

// Mock mínimo del cliente de Supabase: un query builder encadenable que
// registra las llamadas (.from/.select/.eq/.is/.in) y resuelve al final con
// los datos configurados para esa tabla.
const queryLog: { table: string; calls: { method: string; args: unknown[] }[] }[] = [];
let mockResponses: Record<string, { data: unknown[]; error: unknown }> = {};

function makeChainable(table: string) {
  const record = { table, calls: [] as { method: string; args: unknown[] }[] };
  queryLog.push(record);

  const chain: any = {
    select: (...args: unknown[]) => {
      record.calls.push({ method: 'select', args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      record.calls.push({ method: 'eq', args });
      return chain;
    },
    is: (...args: unknown[]) => {
      record.calls.push({ method: 'is', args });
      return chain;
    },
    in: (...args: unknown[]) => {
      record.calls.push({ method: 'in', args });
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(mockResponses[table] ?? { data: [], error: null }).then(resolve),
  };
  return chain;
}

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => makeChainable(table),
  },
}));

import { resolveValidationContext } from './resolveValidationContext';

function fakeParseResult(zoneNames: string[], activityKeys: string[]): ParseResult {
  return {
    sheetName: 'POA INICIAL 2026',
    zonas: zoneNames.map((excelZoneName, i) => ({ excelZoneName, startColumn: i })),
    actividades: activityKeys.map((activityKey, i) => ({
      activityKey,
      descripcion: `Actividad ${activityKey}`,
      unidad: 'M2',
      precioUnitario: 100,
      zonas: [],
      frecuenciasPorZona: [],
      excelRow: i + 4,
    })),
    warnings: [],
  };
}

beforeEach(() => {
  queryLog.length = 0;
  mockResponses = {};
});

describe('resolveValidationContext', () => {
  it('consulta poa_zone_mappings filtrado por poa_id y las zonas detectadas (una sola consulta, con IN)', async () => {
    mockResponses['poa_zone_mappings'] = {
      data: [
        { excel_zone_name: 'Zona A', group_id: 'group-a' },
        { excel_zone_name: 'Zona B', group_id: null },
      ],
      error: null,
    };

    const parseResult = fakeParseResult(['Zona A', 'Zona B'], ['1.01']);
    const context = await resolveValidationContext(parseResult, 'poa-1');

    expect(context.zoneMappings.get('Zona A')).toBe('group-a');
    expect(context.zoneMappings.get('Zona B')).toBeNull();
    expect(context.zoneMappings.has('Zona C')).toBe(false); // nunca consultada, nunca mapeada

    const zoneQuery = queryLog.find((q) => q.table === 'poa_zone_mappings')!;
    expect(zoneQuery.calls).toContainEqual({ method: 'eq', args: ['poa_id', 'poa-1'] });
    expect(zoneQuery.calls).toContainEqual({ method: 'in', args: ['excel_zone_name', ['Zona A', 'Zona B']] });
  });

  // Separación de fases (docs/architecture/poa-technical-catalog-decoupling.md):
  // resolveValidationContext ya NO consulta board_activity_standards — el
  // importador de POA no conoce el catálogo técnico. Si en el futuro alguien
  // reintroduce esa consulta aquí, está remezclando la fase contractual con
  // la fase técnica que se separaron a propósito.
  it('nunca consulta board_activity_standards — el importador no conoce el catálogo técnico', async () => {
    mockResponses['poa_zone_mappings'] = { data: [], error: null };

    const parseResult = fakeParseResult(['Zona A'], ['1.01', '1.02']);
    await resolveValidationContext(parseResult, 'poa-1');

    expect(queryLog.some((q) => q.table === 'board_activity_standards')).toBe(false);
  });

  it('no consulta ninguna tabla cuando el parser no detectó zonas', async () => {
    const parseResult = fakeParseResult([], ['1.01']);
    const context = await resolveValidationContext(parseResult, 'poa-1');

    expect(context.zoneMappings.size).toBe(0);
    expect(queryLog).toHaveLength(0);
  });

  it('propaga el error si la consulta falla', async () => {
    mockResponses['poa_zone_mappings'] = { data: [], error: new Error('conexión perdida') };

    const parseResult = fakeParseResult(['Zona A'], []);
    await expect(resolveValidationContext(parseResult, 'poa-1')).rejects.toThrow('conexión perdida');
  });

  it('hace UNA sola consulta, nunca una por zona individual', async () => {
    mockResponses['poa_zone_mappings'] = { data: [], error: null };

    const manyZones = Array.from({ length: 20 }, (_, i) => `Zona ${i}`);
    const parseResult = fakeParseResult(manyZones, []);

    await resolveValidationContext(parseResult, 'poa-1');

    expect(queryLog.filter((q) => q.table === 'poa_zone_mappings')).toHaveLength(1);
  });

  it('deduplica zonas repetidas antes de construir el IN(...) — sigue siendo una sola consulta con la lista compacta', async () => {
    mockResponses['poa_zone_mappings'] = { data: [], error: null };

    // "Zona A" aparece 50 veces — simula un Excel con un bloque de zona
    // detectado más de una vez.
    const repeatedZones = Array.from({ length: 50 }, () => 'Zona A');
    const parseResult = fakeParseResult(repeatedZones, []);

    await resolveValidationContext(parseResult, 'poa-1');

    expect(queryLog.filter((q) => q.table === 'poa_zone_mappings')).toHaveLength(1);

    const zoneQuery = queryLog.find((q) => q.table === 'poa_zone_mappings')!;
    const zoneInCall = zoneQuery.calls.find((c) => c.method === 'in')!;
    expect(zoneInCall.args).toEqual(['excel_zone_name', ['Zona A']]); // deduplicado, no 50 repeticiones
  });
});
