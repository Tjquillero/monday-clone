import {
  calculateTheoreticalJournals,
  calculateDailyJournals,
  calculateWeeklyDistribution,
  calculateCapacityUsage,
  calculatePerformanceDeviation,
  WORKING_DAYS_MONTH,
} from './schedulerMath';

// Valores reales del contrato (Plateo, Limpieza General, Poda Arbustos)
// Verificados contra la pantalla "Análisis de Recursos y Eficiencia".
// ADR-0009 (2026-07-19): JR_mes = qty / rendimiento — frecuencia ya no
// escala el total (ver schedulerMath.ts). `frec` se conserva en cada caso
// porque sigue siendo un argumento real de la función (gate de actividad
// activa), no porque afecte el resultado esperado.
const CASES = {
  plateo:           { qty: 2295, rend: 160,  frec: 12.5,  expected: 14.34375 },
  limpiezaGeneral:  { qty: 2295, rend: 7500, frec: 2.083, expected: 0.306    },
  podaArbustos:     { qty: 2295, rend: 1495, frec: 12.5,  expected: 1.535    },
  limpieza_playa:   { qty: 3000, rend: 3000, frec: 25,    expected: 1.0      },
  trasiego_playa:   { qty: 5000, rend: 5000, frec: 4,     expected: 1.0      },
};

// ─────────────────────────────────────────────────────────────────────────────
describe('WORKING_DAYS_MONTH', () => {
  it('is 25', () => {
    expect(WORKING_DAYS_MONTH).toBe(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculateTheoreticalJournals', () => {
  describe('valores conocidos del contrato', () => {
    it('Plateo: 2295 und / rend 160 → 14.34 JR (frecuencia no escala el total, ADR-0009)', () => {
      const jr = calculateTheoreticalJournals(
        CASES.plateo.qty,
        CASES.plateo.rend,
        CASES.plateo.frec,
      );
      expect(jr).toBeCloseTo(CASES.plateo.expected, 2);
    });

    it('Limpieza General: 2295 m2 / rend 7500 → 0.31 JR', () => {
      const jr = calculateTheoreticalJournals(
        CASES.limpiezaGeneral.qty,
        CASES.limpiezaGeneral.rend,
        CASES.limpiezaGeneral.frec,
      );
      expect(jr).toBeCloseTo(CASES.limpiezaGeneral.expected, 2);
    });

    it('Poda Arbustos: 2295 m2 / rend 1495 → 1.54 JR', () => {
      const jr = calculateTheoreticalJournals(
        CASES.podaArbustos.qty,
        CASES.podaArbustos.rend,
        CASES.podaArbustos.frec,
      );
      expect(jr).toBeCloseTo(CASES.podaArbustos.expected, 2);
    });

    it('Limpieza playa (frec=25, caso invariante bajo la fórmula anterior): 3000 m2 / rend 3000 → 1.0 JR', () => {
      const jr = calculateTheoreticalJournals(
        CASES.limpieza_playa.qty,
        CASES.limpieza_playa.rend,
        CASES.limpieza_playa.frec,
      );
      expect(jr).toBeCloseTo(CASES.limpieza_playa.expected, 4);
    });

    it('Trasiego playa (frec=4): 5000 m2 / rend 5000 → 1.0 JR (antes 6.25, inflado por el factor 25/frec ya retirado)', () => {
      const jr = calculateTheoreticalJournals(
        CASES.trasiego_playa.qty,
        CASES.trasiego_playa.rend,
        CASES.trasiego_playa.frec,
      );
      expect(jr).toBeCloseTo(CASES.trasiego_playa.expected, 4);
    });

    it('Corte de troncos (1.09, Tablero Principal): 300 UN / rend 20 → 15 JR (antes 375, ADR-0009)', () => {
      const jr = calculateTheoreticalJournals(300, 20, 1);
      expect(jr).toBeCloseTo(15, 4);
    });
  });

  describe('invariante de la fórmula', () => {
    it('duplicar rendimiento reduce JR a la mitad', () => {
      const base   = calculateTheoreticalJournals(1000, 100, 5);
      const double = calculateTheoreticalJournals(1000, 200, 5);
      expect(double).toBeCloseTo(base / 2, 10);
    });

    it('la frecuencia NO cambia el JR mensual — solo determina si la actividad participa (ADR-0009)', () => {
      const frec5  = calculateTheoreticalJournals(1000, 100, 5);
      const frec10 = calculateTheoreticalJournals(1000, 100, 10);
      const frec1  = calculateTheoreticalJournals(1000, 100, 1);
      const frec25 = calculateTheoreticalJournals(1000, 100, 25);
      expect(frec5).toBe(10);
      expect(frec10).toBe(frec5);
      expect(frec1).toBe(frec5);
      expect(frec25).toBe(frec5);
    });

    it('duplicar cantidad duplica JR', () => {
      const base   = calculateTheoreticalJournals(1000, 100, 5);
      const double = calculateTheoreticalJournals(2000, 100, 5);
      expect(double).toBeCloseTo(base * 2, 10);
    });
  });

  describe('entradas inválidas → 0', () => {
    it('qty = 0 → 0', () => expect(calculateTheoreticalJournals(0, 160, 12.5)).toBe(0));
    it('qty < 0 → 0', () => expect(calculateTheoreticalJournals(-100, 160, 12.5)).toBe(0));
    it('rendimiento = 0 → 0', () => expect(calculateTheoreticalJournals(2295, 0, 12.5)).toBe(0));
    it('rendimiento < 0 → 0', () => expect(calculateTheoreticalJournals(2295, -160, 12.5)).toBe(0));
    it('frecuencia = 0 → 0', () => expect(calculateTheoreticalJournals(2295, 160, 0)).toBe(0));
    it('frecuencia < 0 → 0', () => expect(calculateTheoreticalJournals(2295, 160, -1)).toBe(0));
    it('frecuencia = null (ADR-0005, sin programación periódica) → 0', () => expect(calculateTheoreticalJournals(2295, 160, null)).toBe(0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculateDailyJournals', () => {
  it('28.69 JR mensuales → 1.15 JR/día (25 días)', () => {
    expect(calculateDailyJournals(28.6875)).toBeCloseTo(28.6875 / 25, 4);
  });

  it('1.0 JR mensual → 0.04 JR/día', () => {
    expect(calculateDailyJournals(1.0)).toBeCloseTo(0.04, 4);
  });

  it('jr = 0 → 0', () => expect(calculateDailyJournals(0)).toBe(0));
  it('jr < 0 → 0', () => expect(calculateDailyJournals(-5)).toBe(0));
  it('workingDays = 0 → 0', () => expect(calculateDailyJournals(10, 0)).toBe(0));

  it('relación inversa con workingDays', () => {
    const d25 = calculateDailyJournals(100, 25);
    const d20 = calculateDailyJournals(100, 20);
    expect(d20).toBeGreaterThan(d25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculateWeeklyDistribution', () => {
  it('distribuye 28.69 JR en 4 semanas → suma ≈ 28.69', () => {
    const dist = calculateWeeklyDistribution(28.6875);
    const total = dist.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(28.6875, 1);
  });

  it('retorna exactamente 4 semanas por defecto', () => {
    expect(calculateWeeklyDistribution(20)).toHaveLength(4);
  });

  it('retorna N semanas cuando se especifica', () => {
    expect(calculateWeeklyDistribution(20, 3)).toHaveLength(3);
    expect(calculateWeeklyDistribution(20, 5)).toHaveLength(5);
  });

  it('todas las semanas reciben jornales positivos', () => {
    const dist = calculateWeeklyDistribution(10);
    dist.forEach(w => expect(w).toBeGreaterThan(0));
  });

  it('jr = 0 → todas las semanas en 0', () => {
    const dist = calculateWeeklyDistribution(0);
    dist.forEach(w => expect(w).toBe(0));
  });

  it('jr < 0 → todas las semanas en 0', () => {
    const dist = calculateWeeklyDistribution(-5);
    dist.forEach(w => expect(w).toBe(0));
  });

  it('weeksInMonth = 0 → array vacío', () => {
    expect(calculateWeeklyDistribution(10, 0)).toHaveLength(0);
  });

  it('distribución es uniforme en v1 (el optimizador rebalanceará)', () => {
    const dist = calculateWeeklyDistribution(20, 4);
    // Semana 1 y semana 3 deben ser iguales (distribución uniforme)
    expect(dist[0]).toBeCloseTo(dist[2], 2);
    expect(dist[1]).toBeCloseTo(dist[3], 2);
  });

  it('la suma exacta se preserva ajustando el último elemento', () => {
    // 10 JR / 3 semanas → 3.33 + 3.33 + 3.34 = 10.00
    const dist = calculateWeeklyDistribution(10, 3);
    const total = dist.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(10, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculateCapacityUsage', () => {
  describe('caso factible', () => {
    it('100 JR requeridos / cap diaria 8 / 25 días → 200 disponibles, factible', () => {
      const result = calculateCapacityUsage(100, 8);
      expect(result.feasible).toBe(true);
      expect(result.available).toBe(200);
      expect(result.utilizationRate).toBeCloseTo(0.5, 4);
      expect(result.deficit).toBe(0);
    });

    it('uso exacto de capacidad (rate=1) → factible', () => {
      const result = calculateCapacityUsage(200, 8);
      expect(result.feasible).toBe(true);
      expect(result.utilizationRate).toBeCloseTo(1.0, 4);
      expect(result.deficit).toBe(0);
    });
  });

  describe('caso infactible', () => {
    it('250 JR requeridos / cap 8 / 25 días → infactible, déficit 50', () => {
      const result = calculateCapacityUsage(250, 8);
      expect(result.feasible).toBe(false);
      expect(result.available).toBe(200);
      expect(result.utilizationRate).toBeCloseTo(1.25, 4);
      expect(result.deficit).toBeCloseTo(50, 1);
    });
  });

  describe('workingDays personalizado', () => {
    it('22 días hábiles reduce la capacidad disponible', () => {
      const r25 = calculateCapacityUsage(100, 8, 25);
      const r22 = calculateCapacityUsage(100, 8, 22);
      expect(r22.available).toBe(176);
      expect(r25.available).toBe(200);
    });
  });

  describe('entradas inválidas', () => {
    it('dailyCapacity = 0 → infactible', () => {
      const result = calculateCapacityUsage(100, 0);
      expect(result.feasible).toBe(false);
      expect(result.available).toBe(0);
    });

    it('workingDays = 0 → infactible', () => {
      const result = calculateCapacityUsage(100, 8, 0);
      expect(result.feasible).toBe(false);
    });

    it('required = 0 → factible con rate = 0', () => {
      const result = calculateCapacityUsage(0, 8);
      expect(result.feasible).toBe(true);
      expect(result.utilizationRate).toBe(0);
      expect(result.deficit).toBe(0);
    });
  });

  describe('casos reales del contrato', () => {
    it('PLAZA: 8 cap / 25 días → 200 JR disponibles', () => {
      const result = calculateCapacityUsage(0, 8);
      expect(result.available).toBe(200);
    });

    it('MANGLARES: 4 cap / 25 días → 100 JR disponibles', () => {
      const result = calculateCapacityUsage(0, 4);
      expect(result.available).toBe(100);
    });

    it('CENTRO GASTRONÓMICO: 10 cap / 25 días → 250 JR disponibles', () => {
      const result = calculateCapacityUsage(0, 10);
      expect(result.available).toBe(250);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculatePerformanceDeviation', () => {
  it('estándar == observado → desviación 0', () => {
    expect(calculatePerformanceDeviation(160, 160)).toBe(0);
  });

  it('observado > estándar → desviación positiva (mejor rendimiento)', () => {
    // 200 vs 160 → +25%
    expect(calculatePerformanceDeviation(160, 200)).toBeCloseTo(0.25, 4);
  });

  it('observado < estándar → desviación negativa (bajo rendimiento)', () => {
    // 100 vs 160 → -37.5%
    expect(calculatePerformanceDeviation(160, 100)).toBeCloseTo(-0.375, 4);
  });

  it('estándar = 0 → 0 (evita división por cero)', () => {
    expect(calculatePerformanceDeviation(0, 200)).toBe(0);
  });

  it('observado = 0 → -1.0 (rendimiento cero = 100% bajo el estándar)', () => {
    expect(calculatePerformanceDeviation(160, 0)).toBeCloseTo(-1.0, 4);
  });

  it('umbral de alerta: |desviación| > 0.20', () => {
    const acceptable  = calculatePerformanceDeviation(160, 180); // +12.5% → ok
    const alertable   = calculatePerformanceDeviation(160, 120); // -25% → alerta
    expect(Math.abs(acceptable)).toBeLessThan(0.20);
    expect(Math.abs(alertable)).toBeGreaterThan(0.20);
  });

  describe('casos reales del contrato', () => {
    it('Plateo rinde 140 vs estándar 160 → -12.5% (aceptable)', () => {
      expect(calculatePerformanceDeviation(160, 140)).toBeCloseTo(-0.125, 4);
    });

    it('Limpieza playa rinde 2200 vs estándar 3000 → -26.7% (alerta)', () => {
      const dev = calculatePerformanceDeviation(3000, 2200);
      expect(dev).toBeCloseTo(-0.2667, 3);
      expect(Math.abs(dev)).toBeGreaterThan(0.20);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('integración — flujo completo de planificación', () => {
  it('Plateo en PLAZA: de qty a distribución semanal', () => {
    // Datos: qty=2295 und, rend=160 und/jornal, frec=12.5, cap=8 workers
    // ADR-0009: JR_mes = qty/rendimiento = 2295/160 = 14.34 (frecuencia ya no escala el total)
    const jr = calculateTheoreticalJournals(2295, 160, 12.5);
    expect(jr).toBeCloseTo(14.34, 1);

    const daily = calculateDailyJournals(jr);
    expect(daily).toBeCloseTo(0.57, 1);

    const weekly = calculateWeeklyDistribution(jr);
    expect(weekly).toHaveLength(4);
    expect(weekly.reduce((a, b) => a + b, 0)).toBeCloseTo(jr, 1);

    const capacity = calculateCapacityUsage(jr, 8); // PLAZA: daily_capacity=8
    expect(capacity.feasible).toBe(true);
    expect(capacity.utilizationRate).toBeLessThan(1);
  });

  it('detecta sobrecarga cuando JR totales > capacidad mensual', () => {
    // Simula un sitio con 3 cap y muchas actividades (200 JR requeridos)
    const capacity = calculateCapacityUsage(200, 3);
    expect(capacity.feasible).toBe(false);
    expect(capacity.deficit).toBeGreaterThan(0);
    expect(capacity.utilizationRate).toBeGreaterThan(1);
  });

  it('rendimiento observado peor que estándar activa alerta correctamente', () => {
    // Estándar: 160 und/jornal.
    // Ejecución real: 10 jornales usados, solo 1200 und ejecutadas.
    // Rendimiento observado = 1200/10 = 120 und/jornal (< 160 → alerta).
    const jornales_usados = 10;
    const qty_ejecutada   = 1200;
    const rendimiento_observado = qty_ejecutada / jornales_usados; // 120
    const desviacion = calculatePerformanceDeviation(160, rendimiento_observado);
    // -0.25 → 25% por debajo del estándar, supera el umbral de 20%
    expect(desviacion).toBeCloseTo(-0.25, 4);
    expect(desviacion).toBeLessThan(0);
    expect(Math.abs(desviacion)).toBeGreaterThan(0.20);
  });
});
