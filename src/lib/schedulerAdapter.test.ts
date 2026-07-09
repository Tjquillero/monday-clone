import { buildActivityMappings, ActivityRule } from './schedulerAdapter';
import { ActivityStandardWithFrecuencia, ScopeMapping } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// Factories mínimas — solo los campos que buildActivityMappings consume
// ─────────────────────────────────────────────────────────────────────────────

function std(overrides: Partial<ActivityStandardWithFrecuencia> = {}): ActivityStandardWithFrecuencia {
  return {
    id: 'test-id',
    board_id: 'board-1',
    group_id: null,
    activity_key: 'test_activity',
    name: 'Test Activity',
    category: 'ZONA VERDE',
    unit: 'm2/dia',
    rendimiento: 100,
    frecuencia: 25,
    priority: 'preferred',
    version: 1,
    effective_from: '2026-01-01',
    effective_to: null,
    source: 'operational_manual',
    created_at: '2026-01-01T00:00:00Z',
    poa_activity_zone_id: 'test-poa-activity-zone-id',
    ...overrides,
  };
}

function map(activity_key: string, scope_key: string): ScopeMapping {
  return { activity_key, scope_key, weight: 1.0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildActivityMappings', () => {
  describe('un activity_key → un scope_key', () => {
    it('produce una sola entrada en el scope correcto', () => {
      const result = buildActivityMappings(
        [std({ activity_key: 'plateo', name: 'Plateo', rendimiento: 160, frecuencia: 12.5, unit: 'und/dia' })],
        [map('plateo', 'arbustos')],
      );

      expect(result).toHaveProperty('arbustos');
      expect(result['arbustos']).toHaveLength(1);
      expect(result['arbustos'][0]).toMatchObject<ActivityRule>({
        name: 'Plateo',
        unit: 'und/dia',
        rend: 160,
        freq: 12.5,
        category: 'ZONA VERDE',
      });
    });

    it('traduce rendimiento→rend y frecuencia→freq sin perder valores', () => {
      // Este test protege contra renombrar los campos en ActivityStandard
      // sin actualizar el adapter — un cambio silencioso que rompería el cálculo.
      const result = buildActivityMappings(
        [std({ activity_key: 'op_guadana', rendimiento: 5000, frecuencia: 25 })],
        [map('op_guadana', 'grama')],
      );

      const rule = result['grama'][0];
      expect(rule.rend).toBe(5000);
      expect(rule.freq).toBe(25);
      expect((rule as any).rendimiento).toBeUndefined();
      expect((rule as any).frecuencia).toBeUndefined();
    });
  });

  describe('un activity_key → varios scope_keys', () => {
    it('genera una entrada en cada scope', () => {
      const result = buildActivityMappings(
        [std({ activity_key: 'limpieza_general', name: 'Limpieza General', rendimiento: 7500, frecuencia: 2.083 })],
        [
          map('limpieza_general', 'total_paisajismo'),
          map('limpieza_general', 'zona_verde'),
        ],
      );

      expect(result['total_paisajismo']).toHaveLength(1);
      expect(result['zona_verde']).toHaveLength(1);
      expect(result['total_paisajismo'][0].name).toBe('Limpieza General');
      expect(result['zona_verde'][0].name).toBe('Limpieza General');
      // Los valores rend/freq son idénticos en ambos scopes
      expect(result['total_paisajismo'][0].rend).toBe(result['zona_verde'][0].rend);
    });
  });

  describe('activity_key sin mapeo', () => {
    it('la actividad no aparece en el resultado', () => {
      const result = buildActivityMappings(
        [std({ activity_key: 'actividad_huerfana' })],
        [], // sin mapeos
      );

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('actividades sin mapeo no contaminan los scopes de las que sí tienen', () => {
      const result = buildActivityMappings(
        [
          std({ activity_key: 'plateo', name: 'Plateo' }),
          std({ activity_key: 'sin_mapeo', name: 'Sin Mapeo' }),
        ],
        [map('plateo', 'arbustos')],
      );

      expect(Object.keys(result)).toEqual(['arbustos']);
      expect(result['arbustos'].map(r => r.name)).toEqual(['Plateo']);
    });
  });

  describe('múltiples actividades en el mismo scope_key', () => {
    it('se acumulan bajo ese scope en el orden de standards[]', () => {
      const result = buildActivityMappings(
        [
          std({ activity_key: 'plateo', name: 'Plateo', rendimiento: 160, frecuencia: 12.5, unit: 'und/dia' }),
          std({ activity_key: 'poda_arbustos', name: 'Poda Arbustos y CS', rendimiento: 1495, frecuencia: 12.5 }),
          std({ activity_key: 'mantenimiento_cama_siembra', name: 'Mto Cama Siembra', rendimiento: 450, frecuencia: 6.25 }),
        ],
        [
          map('plateo', 'arbustos'),
          map('poda_arbustos', 'arbustos'),
          map('mantenimiento_cama_siembra', 'arbustos'),
        ],
      );

      expect(result['arbustos']).toHaveLength(3);
      expect(result['arbustos'].map(r => r.name)).toEqual([
        'Plateo',
        'Poda Arbustos y CS',
        'Mto Cama Siembra',
      ]);
    });
  });

  describe('casos límite', () => {
    it('sin standards → resultado vacío', () => {
      expect(buildActivityMappings([], [map('plateo', 'arbustos')])).toEqual({});
    });

    it('sin mappings → resultado vacío aunque haya standards', () => {
      expect(buildActivityMappings([std()], [])).toEqual({});
    });

    it('ambas listas vacías → resultado vacío', () => {
      expect(buildActivityMappings([], [])).toEqual({});
    });
  });

  describe('verificación con datos reales del contrato', () => {
    it('reproduce el scope arbustos del STANDARD_MAPPINGS original (6 actividades)', () => {
      const standards = [
        std({ activity_key: 'plateo',                        name: 'Plateo',                   rendimiento: 160,  frecuencia: 12.5, unit: 'und/dia' }),
        std({ activity_key: 'poda_arbustos',                 name: 'Poda Arbustos y CS',        rendimiento: 1495, frecuencia: 12.5 }),
        std({ activity_key: 'mantenimiento_cama_siembra',    name: 'Mto Cama Siembra',          rendimiento: 450,  frecuencia: 6.25 }),
        std({ activity_key: 'riego_arbustos',                name: 'Riego general Arbusto',     rendimiento: 3500, frecuencia: 2.083 }),
        std({ activity_key: 'insecticida_fungicida_arbustos',name: 'TC Insect y Fung Arbus',    rendimiento: 2400, frecuencia: 50 }),
        std({ activity_key: 'fertilizacion_arbustos',        name: 'Fertil Arbust y Cubresul',  rendimiento: 3500, frecuencia: 150 }),
      ];
      const mappings = standards.map(s => map(s.activity_key, 'arbustos'));

      const result = buildActivityMappings(standards, mappings);

      expect(result['arbustos']).toHaveLength(6);
      // Verificar que los valores numéricos del contrato se preservan exactamente
      const plateo = result['arbustos'].find(r => r.name === 'Plateo')!;
      expect(plateo.rend).toBe(160);
      expect(plateo.freq).toBe(12.5);
    });

    it('reproduce el scope grama del STANDARD_MAPPINGS original (5 actividades)', () => {
      const standards = [
        std({ activity_key: 'op_guadana',                   name: 'Op Guadaña',                rendimiento: 5000, frecuencia: 25 }),
        std({ activity_key: 'riego_grama',                  name: 'Riego general Grama',        rendimiento: 3500, frecuencia: 2.083 }),
        std({ activity_key: 'insecticida_fungicida_grama',  name: 'TC Insecticida y Fungicida', rendimiento: 3500, frecuencia: 150 }),
        std({ activity_key: 'herbicida_grama',              name: 'TC Herbicida Grama',         rendimiento: 2400, frecuencia: 50 }),
        std({ activity_key: 'fertilizacion_grama',          name: 'Fertil Grama',               rendimiento: 3500, frecuencia: 150 }),
      ];
      const mappings = standards.map(s => map(s.activity_key, 'grama'));

      const result = buildActivityMappings(standards, mappings);

      expect(result['grama']).toHaveLength(5);
      expect(result['grama'].map(r => r.rend)).toEqual([5000, 3500, 3500, 2400, 3500]);
    });
  });
});
