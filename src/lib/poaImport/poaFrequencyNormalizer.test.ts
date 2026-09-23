import {
  normalizePoaFrequency,
  isDailyActivityByMetadata,
} from './poaFrequencyNormalizer';

describe('POA Frequency Normalizer Suite', () => {
  it('1. FREC = 1 en Excel para una actividad semanal sin metadatos diarios debe transformarse a 4', () => {
    const res = normalizePoaFrequency({
      frecExcel: 1,
      descripcion: 'Trasiego con maquinaria en sitio estratégico',
      unit: 'M²',
    });
    expect(res).toBe(4);
  });

  it('2. FREC = 1 en Excel para una actividad de Limpieza Manual de Playa debe transformarse a 4', () => {
    const res = normalizePoaFrequency({
      frecExcel: 1,
      descripcion: 'Limpieza manual de playa en sectores críticos',
      unit: 'M²',
    });
    expect(res).toBe(4);
  });

  it('3. FREC = 1 en Excel con unidad DIA o descripción DIARIA debe conservarse como 1 (diario L-S)', () => {
    const res = normalizePoaFrequency({
      frecExcel: 1,
      descripcion: 'Limpieza manual diaria de zona verde',
      unit: 'DIA',
    });
    expect(res).toBe(1);
    expect(isDailyActivityByMetadata({ descripcion: 'Limpieza diaria' })).toBe(true);
  });

  it('4. FREC = 6 en Excel debe transformarse a 1 (diario L-S para el Scheduler)', () => {
    const res = normalizePoaFrequency({
      frecExcel: 6,
      descripcion: 'Limpieza general',
    });
    expect(res).toBe(1);
  });

  it('5. Frecuencias fraccionarias (0.5, 0.333, 0.25) deben conservarse intactas', () => {
    expect(normalizePoaFrequency({ frecExcel: 0.5 })).toBe(0.5);
    expect(normalizePoaFrequency({ frecExcel: 0.333 })).toBe(0.333);
    expect(normalizePoaFrequency({ frecExcel: 0.25 })).toBe(0.25);
  });

  it('6. Frecuencias nulas o <= 0 deben retornar null', () => {
    expect(normalizePoaFrequency({ frecExcel: null })).toBeNull();
    expect(normalizePoaFrequency({ frecExcel: 0 })).toBeNull();
    expect(normalizePoaFrequency({ frecExcel: -1 })).toBeNull();
  });
});
