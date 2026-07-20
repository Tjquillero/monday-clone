import { buildWeeklyPlanningContext, calculateContractWeek, getWeekBounds, getMonday, getBogotaToday, ZoneInfo, WeekInfo } from './weeklyPlanner';
import { ActivityStandardWithFrecuencia, ScopeMapping } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

function std(overrides: Partial<ActivityStandardWithFrecuencia> = {}): ActivityStandardWithFrecuencia {
  return {
    id: 'test-id',
    board_id: 'board-1',
    group_id: null,
    activity_key: 'plateo',
    name: 'Plateo',
    category: 'ZONA VERDE',
    unit: 'und/dia',
    rendimiento: 160,
    requiere_rendimiento: true,
    frecuencia: 12.5,
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
  return { activity_key, scope_key, weight: 1 };
}

const ZONE: ZoneInfo = { id: 'group-plaza', name: 'PLAZA PUERTO COLOMBIA', daily_capacity: 8 };
const WEEK_1: WeekInfo = { start: new Date('2026-06-01'), number: 1, workingDays: 5 };
const WEEK_2: WeekInfo = { start: new Date('2026-06-08'), number: 2, workingDays: 5 };
const WEEK_4: WeekInfo = { start: new Date('2026-06-22'), number: 4, workingDays: 5 };

const PLATEO_STD = [std()];
const PLATEO_MAP = [map('plateo', 'arbustos')];
// PLAZA: 2295 arbustos → JR/mes = 2295 / 160 = 14.34 aprox (ADR-0009)
const PLAZA_QTY = { arbustos: 2295 };

// ─────────────────────────────────────────────────────────────────────────────
// getMonday / getBogotaToday
// ─────────────────────────────────────────────────────────────────────────────

describe('getMonday', () => {
  it('un lunes se devuelve a sí mismo', () => {
    expect(getMonday(new Date('2026-07-13T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-07-13');
  });

  it('un domingo (UTC) resuelve al lunes de esa misma semana ISO, no a la siguiente', () => {
    // 2026-07-19 es domingo — pertenece a la semana 2026-07-13..19, no a 2026-07-20..26.
    expect(getMonday(new Date('2026-07-19T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-07-13');
  });

  it('un sábado resuelve al lunes de la misma semana', () => {
    expect(getMonday(new Date('2026-07-18T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-07-13');
  });
});

describe('getBogotaToday', () => {
  // No se mockea el reloj: se compara contra un cálculo independiente del
  // día de negocio en America/Bogota, para no probar la función contra sí misma.
  it('coincide con la fecha calendario actual en America/Bogota (no en UTC ni en la hora local del test runner)', () => {
    const expected = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    expect(getBogotaToday().toISOString().slice(0, 10)).toBe(expected);
  });

  it('devuelve medianoche UTC exacta (fecha calendario pura, sin componente de hora)', () => {
    const d = getBogotaToday();
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateWeekNumber
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateContractWeek', () => {
  it.each([
    [1, 1], [7, 1],
    [8, 2], [14, 2],
    [15, 3], [21, 3],
    [22, 4], [28, 4], [30, 4], // junio tiene 30 días; 31 no existe en este mes
  ])('día %d del mes → semana %d', (day, expectedWeek) => {
    const date = new Date(`2026-06-${String(day).padStart(2, '0')}`);
    expect(calculateContractWeek(date)).toBe(expectedWeek);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getWeekBounds
// ─────────────────────────────────────────────────────────────────────────────

describe('getWeekBounds', () => {
  it('lunes → viernes de la misma semana', () => {
    const bounds = getWeekBounds(new Date('2026-06-01')); // lunes
    expect(bounds.start).toBe('2026-06-01');
    expect(bounds.end).toBe('2026-06-05');
  });

  it('cualquier día de inicio + 4 días = fin', () => {
    const bounds = getWeekBounds(new Date('2026-06-22'));
    expect(bounds.start).toBe('2026-06-22');
    expect(bounds.end).toBe('2026-06-26');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyPlanningContext — determinismo
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyPlanningContext — determinismo', () => {
  it('misma entrada → mismo plan siempre (sin Date.now, Math.random ni estado mutable)', () => {
    const ctx1 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    const ctx2 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    expect(ctx1).toEqual(ctx2);
  });

  it('misma entrada con estándares en distinto orden → mismo plan (sort estable)', () => {
    const standards = [
      std({ activity_key: 'plateo',         priority: 'preferred' }),
      std({ activity_key: 'poda_arbustos',  priority: 'must_execute', rendimiento: 1495 }),
    ];
    const mappings = [
      map('plateo', 'arbustos'),
      map('poda_arbustos', 'arbustos'),
    ];
    const reversed = [...standards].reverse();

    const ctx1 = buildWeeklyPlanningContext(standards, mappings, { arbustos: 2295 }, ZONE, WEEK_1);
    const ctx2 = buildWeeklyPlanningContext(reversed, mappings, { arbustos: 2295 }, ZONE, WEEK_1);

    // El orden de activities[] en ambos planes debe ser idéntico (must_execute primero)
    expect(ctx1.activities.map(a => a.activity_key)).toEqual(ctx2.activities.map(a => a.activity_key));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyPlanningContext — semana+7 días
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyPlanningContext — semana+7 días', () => {
  it('theoretical_journals_month no cambia al cambiar de semana', () => {
    const ctx1 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    const ctx2 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_2);

    ctx1.activities.forEach((a, i) => {
      expect(a.theoretical_journals_month).toBeCloseTo(ctx2.activities[i].theoretical_journals_month, 4);
    });
  });

  it('week.number cambia al cambiar de semana', () => {
    const ctx1 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    const ctx2 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_2);
    expect(ctx1.week.number).toBe(1);
    expect(ctx2.week.number).toBe(2);
  });

  it('última semana puede tener JR semanal distinto por ajuste de redondeo', () => {
    const ctx1 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    const ctx4 = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_4);
    // Semana 4 absorbe el residuo → no necesariamente igual a semana 1
    // Lo importante: la suma de las 4 semanas ≈ jr_month
    const jr_month = ctx1.activities[0].theoretical_journals_month;
    const jr_w1 = ctx1.activities[0].theoretical_journals_week;
    const jr_w4 = ctx4.activities[0].theoretical_journals_week;
    expect(jr_w1 + jr_w1 + jr_w1 + jr_w4).toBeCloseTo(jr_month, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyPlanningContext — prioridad
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyPlanningContext — prioridad', () => {
  it('must_execute aparece primero aunque se ingrese en último lugar', () => {
    const standards = [
      std({ activity_key: 'a', priority: 'flexible',     rendimiento: 3500, frecuencia: 25 }),
      std({ activity_key: 'b', priority: 'preferred',    rendimiento: 3500, frecuencia: 25 }),
      std({ activity_key: 'c', priority: 'must_execute', rendimiento: 3500, frecuencia: 25 }),
    ];
    const mappings = [map('a', 'grama'), map('b', 'grama'), map('c', 'grama')];
    const ctx = buildWeeklyPlanningContext(standards, mappings, { grama: 5000 }, ZONE, WEEK_1);

    expect(ctx.activities[0].priority).toBe('must_execute');
    expect(ctx.activities[1].priority).toBe('preferred');
    expect(ctx.activities[2].priority).toBe('flexible');
  });

  it('actividades con misma prioridad mantienen el orden de entrada (sort estable)', () => {
    const standards = [
      std({ activity_key: 'primero',  priority: 'preferred', rendimiento: 3500, frecuencia: 25 }),
      std({ activity_key: 'segundo',  priority: 'preferred', rendimiento: 3500, frecuencia: 25 }),
    ];
    const mappings = [map('primero', 'grama'), map('segundo', 'grama')];
    const ctx = buildWeeklyPlanningContext(standards, mappings, { grama: 5000 }, ZONE, WEEK_1);

    expect(ctx.activities[0].activity_key).toBe('primero');
    expect(ctx.activities[1].activity_key).toBe('segundo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyPlanningContext — cantidades y actividades vacías
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyPlanningContext — cantidades', () => {
  it('actividad con qty=0 no aparece en el plan', () => {
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, { arbustos: 0 }, ZONE, WEEK_1);
    expect(ctx.activities).toHaveLength(0);
  });

  it('scope_key ausente en scopeQuantities equivale a qty=0', () => {
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, {}, ZONE, WEEK_1);
    expect(ctx.activities).toHaveLength(0);
  });

  it('sin estándares → plan vacío y capacity.weekly_required=0', () => {
    const ctx = buildWeeklyPlanningContext([], [], {}, ZONE, WEEK_1);
    expect(ctx.activities).toHaveLength(0);
    expect(ctx.capacity.weekly_required).toBe(0);
  });

  it('activity_key sin mapeo no aparece aunque tenga qty', () => {
    const ctx = buildWeeklyPlanningContext(
      PLATEO_STD,
      [],            // sin scope mappings
      { arbustos: 2295 },
      ZONE,
      WEEK_1,
    );
    expect(ctx.activities).toHaveLength(0);
  });

  it('actividad con frecuencia=null (ADR-0005) no aparece aunque tenga qty y rendimiento', () => {
    const ctx = buildWeeklyPlanningContext(
      [std({ frecuencia: null })],
      PLATEO_MAP,
      { arbustos: 2295 },
      ZONE,
      WEEK_1,
    );
    expect(ctx.activities).toHaveLength(0);
  });

  it('actividad con requiere_rendimiento=false (Decisión 4) no aparece aunque tenga qty y frecuencia', () => {
    const ctx = buildWeeklyPlanningContext(
      [std({ requiere_rendimiento: false, rendimiento: null })],
      PLATEO_MAP,
      { arbustos: 2295 },
      ZONE,
      WEEK_1,
    );
    expect(ctx.activities).toHaveLength(0);
  });

  it('requiere_rendimiento=true (default) sigue generando el plan normalmente', () => {
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, { arbustos: 2295 }, ZONE, WEEK_1);
    expect(ctx.activities).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyPlanningContext — factibilidad
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyPlanningContext — factibilidad', () => {
  it('plan factible cuando JR total ≤ capacidad mensual', () => {
    // daily_capacity=8, 25 días → 200 JR disponibles
    // Plateo PLAZA: 2295/160 = 14.34 JR/mes (ADR-0009) → factible
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    expect(ctx.capacity.feasible).toBe(true);
    expect(ctx.capacity.deficit).toBe(0);
  });

  it('plan infactible cuando JR total > capacidad mensual', () => {
    // daily_capacity=0.5 → solo 12.5 JR/mes disponibles
    // Plateo PLAZA: 14.34 JR/mes (ADR-0009) → infactible
    const tinyZone: ZoneInfo = { ...ZONE, daily_capacity: 0.5 };
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, tinyZone, WEEK_1);
    expect(ctx.capacity.feasible).toBe(false);
    expect(ctx.capacity.deficit).toBeGreaterThan(0);
  });

  it('available_capacity semanal nunca es negativa', () => {
    const tinyZone: ZoneInfo = { ...ZONE, daily_capacity: 1 };
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, tinyZone, WEEK_1);
    expect(ctx.zone.available_capacity).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyPlanningContext — valores reales del contrato
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyPlanningContext — valores reales del contrato', () => {
  it('Plateo PLAZA: 2295 arbustos → ~14.34 JR/mes (ADR-0009: frecuencia no escala el total)', () => {
    // qty=2295, rend=160 → JR = 2295/160 = 14.34375
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    const plateo = ctx.activities.find(a => a.activity_key === 'plateo');
    expect(plateo).toBeDefined();
    expect(plateo!.theoretical_journals_month).toBeCloseTo(14.34, 2);
  });

  it('Plateo PLAZA semana 1: JR semanal ≈ 3.59 (14.34/4)', () => {
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    const plateo = ctx.activities[0];
    expect(plateo.theoretical_journals_week).toBeCloseTo(3.59, 1);
  });

  it('Plateo PLAZA: la suma de las 4 semanas ≈ JR mensual', () => {
    const weeks = [WEEK_1, WEEK_2, { ...WEEK_1, start: new Date('2026-06-15'), number: 3 as const }, WEEK_4];
    const weeklyJrs = weeks.map(w =>
      buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, w).activities[0]
        .theoretical_journals_week
    );
    const totalWeeklyJr = weeklyJrs.reduce((s, n) => s + n, 0);
    const monthlyJr = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1)
      .activities[0].theoretical_journals_month;
    expect(totalWeeklyJr).toBeCloseTo(monthlyJr, 1);
  });

  it('reproduciría la capacidad de PLAZA: 8 jornales/día × 25 días = 200 JR/mes', () => {
    const ctx = buildWeeklyPlanningContext([], [], {}, ZONE, WEEK_1);
    expect(ctx.zone.daily_capacity).toBe(8);
    // Con 0 actividades: 8 × 5 días hábiles de la semana = 40 JR semanales disponibles
    expect(ctx.capacity.weekly_available).toBe(40);
  });

  it('constraints están vacíos en v1 (no se usan reglas todavía)', () => {
    const ctx = buildWeeklyPlanningContext(PLATEO_STD, PLATEO_MAP, PLAZA_QTY, ZONE, WEEK_1);
    expect(ctx.constraints.incompatible_pairs).toHaveLength(0);
    expect(ctx.constraints.dependencies).toHaveLength(0);
    expect(ctx.constraints.weather_sensitive).toHaveLength(0);
  });
});
