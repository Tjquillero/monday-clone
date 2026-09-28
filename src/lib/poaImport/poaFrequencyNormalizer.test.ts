import {
  normalizePoaFrequency,
  isDailyActivityByMetadata,
  resolvePoaFrequencyWithPrecedence,
} from './poaFrequencyNormalizer';

describe('POA Frequency Normalizer & Hierarchical Evidence Matrix Suite (v2.0)', () => {
  describe('1. Evidencia Explícita en Metadatos (Precedencia Máxima - Nivel 1)', () => {
    it('1A. Unidad DIA o descripción DIARIO asigna canonicalFrequency = 1 (EXPLICIT_METADATA)', () => {
      const res = resolvePoaFrequencyWithPrecedence({
        frecExcel: 1,
        descripcion: 'Limpieza manual diaria de zona verde',
        unit: 'DIA',
      });
      expect(res.canonicalFrequency).toBe(1);
      expect(res.evidenceLevel).toBe('EXPLICIT_METADATA');
      expect(res.hasConflict).toBe(false);
      expect(res.requiresHumanReview).toBe(false);
    });

    it('1B. Metadato explícito SEMANAL GANA sobre palabras clave diarias (Invariante L1 > L4)', () => {
      const res = resolvePoaFrequencyWithPrecedence({
        frecExcel: 1,
        activityKey: '2.07',
        descripcion: 'Trasiego de material con periodicidad semanal',
        unit: 'M²',
      });
      // El metadato explícito SEMANAL gana (4), pero se marca el conflicto con TRASIEGO
      expect(res.canonicalFrequency).toBe(4);
      expect(res.evidenceLevel).toBe('EXPLICIT_METADATA');
      expect(res.hasConflict).toBe(true);
      expect(res.conflictDescription).toBe('EXPLICIT_WEEKLY_TEXT_VS_OPERATIONAL_DAILY_KEYWORD');
      expect(res.requiresHumanReview).toBe(true);
    });

    it('1C. Metadato explícito QUINCENAL (12.5) y MENSUAL (25) asignan frecuencias canónicas para Scheduler', () => {
      const q = resolvePoaFrequencyWithPrecedence({ frecExcel: 1, descripcion: 'Revisión quincenal de equipos' });
      expect(q.canonicalFrequency).toBe(12.5);
      expect(q.evidenceLevel).toBe('EXPLICIT_METADATA');

      const m = resolvePoaFrequencyWithPrecedence({ frecExcel: 1, descripcion: 'Auditoría mensual de vertimientos' });
      expect(m.canonicalFrequency).toBe(25);
      expect(m.evidenceLevel).toBe('EXPLICIT_METADATA');
    });
  });

  describe('2. Frecuencia Numérica Contractual Inequívoca (Nivel 2)', () => {
    it('FREC = 6 en Excel normaliza a 1 (diario L-S para Scheduler)', () => {
      const res = resolvePoaFrequencyWithPrecedence({ frecExcel: 6, descripcion: 'Limpieza general' });
      expect(res.canonicalFrequency).toBe(1);
      expect(res.evidenceLevel).toBe('NUMERIC_CONTRACTUAL');
    });

    it('FREC = 4 en Excel normaliza a 4 (1x/semana Lunes para Scheduler)', () => {
      const res = resolvePoaFrequencyWithPrecedence({ frecExcel: 4, descripcion: 'Mantenimiento preventivo' });
      expect(res.canonicalFrequency).toBe(4);
      expect(res.evidenceLevel).toBe('NUMERIC_CONTRACTUAL');
    });

    it('Frecuencias periódicas fraccionarias (0.5, 0.333, 0.25, 2, 12) se preservan exactas', () => {
      expect(normalizePoaFrequency({ frecExcel: 0.5 })).toBe(0.5);
      expect(normalizePoaFrequency({ frecExcel: 0.333 })).toBe(0.333);
      expect(normalizePoaFrequency({ frecExcel: 0.25 })).toBe(0.25);
      expect(normalizePoaFrequency({ frecExcel: 2 })).toBe(2);
      expect(normalizePoaFrequency({ frecExcel: 12 })).toBe(12);
    });
  });

  describe('3. Heurística Operativa Secundaria (Nivel 4)', () => {
    it('FREC = 1 + Palabra clave TRASIEGO sin indicador semanal inferencia a 1 (diario L-S)', () => {
      const res = resolvePoaFrequencyWithPrecedence({
        frecExcel: 1,
        activityKey: '2.07',
        descripcion: 'Arrume con tractor en sitio estratégico (trasiego)',
        unit: 'M²',
      });
      expect(res.canonicalFrequency).toBe(1);
      expect(res.evidenceLevel).toBe('OPERATIONAL_HEURISTIC');
      expect(res.hasConflict).toBe(false);
      expect(res.requiresHumanReview).toBe(false);
    });

    it('FREC = 1 + Palabra clave CARGUE sin indicador semanal inferencia a 1 (diario L-S)', () => {
      const res = resolvePoaFrequencyWithPrecedence({
        frecExcel: 1,
        activityKey: '2.06',
        descripcion: 'Cargue con tractor de material acopiado',
        unit: 'M²',
      });
      expect(res.canonicalFrequency).toBe(1);
      expect(res.evidenceLevel).toBe('OPERATIONAL_HEURISTIC');
    });

    it('FREC = 1 + Código Capítulo 1/2 sin indicador semanal inferencia a 1 (diario L-S)', () => {
      const res = resolvePoaFrequencyWithPrecedence({
        frecExcel: 1,
        activityKey: '1.09',
        descripcion: 'Operación rutinaria de playa',
        unit: 'M²',
      });
      expect(res.canonicalFrequency).toBe(1);
      expect(res.evidenceLevel).toBe('OPERATIONAL_HEURISTIC');
    });
  });

  describe('4. Tratamiento de Ambigüedad — "No Inventar Semántica Silenciosamente" (Nivel 5)', () => {
    it('FREC = 1 sin metadatos diarios ni palabras clave ni capítulo rutinario retorna NULL y exige revisión humana', () => {
      const res = resolvePoaFrequencyWithPrecedence({
        frecExcel: 1,
        activityKey: '9.01',
        descripcion: 'Informe de gestión ambiental semestral',
        unit: 'INFORME',
      });

      expect(res.canonicalFrequency).toBeNull(); // Estrictamente NULL, NO adivina 4 ni 1
      expect(res.evidenceLevel).toBe('AMBIGUOUS_UNRESOLVED');
      expect(res.hasConflict).toBe(true);
      expect(res.requiresHumanReview).toBe(true);
      expect(res.confidenceScore).toBe(0.0);
    });

    it('Valores nulos, 0 o negativos retornan NULL con AMBIGUOUS_UNRESOLVED', () => {
      expect(resolvePoaFrequencyWithPrecedence({ frecExcel: null }).canonicalFrequency).toBeNull();
      expect(resolvePoaFrequencyWithPrecedence({ frecExcel: 0 }).canonicalFrequency).toBeNull();
      expect(resolvePoaFrequencyWithPrecedence({ frecExcel: -1 }).canonicalFrequency).toBeNull();
    });
  });

  describe('5. Determinismo e Invarianza de Ejecución', () => {
    it('Invocaciones repetidas con las mismas entradas producen resultados idénticos sin deriva', () => {
      const input = { frecExcel: 1, activityKey: '2.07', descripcion: 'Trasiego de material' };
      const res1 = resolvePoaFrequencyWithPrecedence(input);
      const res2 = resolvePoaFrequencyWithPrecedence(input);

      expect(res1).toEqual(res2);
    });
  });
});
