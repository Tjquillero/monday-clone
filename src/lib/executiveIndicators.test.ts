import { rankSitesByUtilization, computeJrPareto } from './executiveIndicators';
import { BoardSitePlan } from './weeklyPlanner';
import { PlanningActivity, WeeklyPlanningContext } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

function activity(overrides: Partial<PlanningActivity> = {}): PlanningActivity {
  return {
    activity_key: 'plateo',
    name: 'Plateo',
    category: 'ZONA VERDE',
    priority: 'preferred',
    qty: 100,
    unit: 'und',
    rendimiento: 20,
    frecuencia: 12.5,
    theoretical_journals_month: 5,
    theoretical_journals_week: 1.25,
    rules: [],
    ...overrides,
  };
}

function site(
  groupId: string,
  title: string,
  overrides: {
    activities?: PlanningActivity[];
    weekly_available?: number;
    weekly_required?: number;
    feasible?: boolean;
    deficit?: number;
  } = {},
): BoardSitePlan {
  const activities = overrides.activities ?? [activity()];
  const weekly_available = overrides.weekly_available ?? 10;
  const weekly_required = overrides.weekly_required ?? 5;
  const plan: WeeklyPlanningContext = {
    week: { start: '2026-07-13', end: '2026-07-17', number: 3, working_days: 5 },
    zone: { id: groupId, name: title, daily_capacity: 2, available_capacity: weekly_available - weekly_required },
    activities,
    capacity: {
      weekly_available,
      weekly_required,
      feasible: overrides.feasible ?? weekly_required <= weekly_available,
      deficit: overrides.deficit ?? Math.max(0, weekly_required - weekly_available),
    },
    constraints: { incompatible_pairs: [], dependencies: [], weather_sensitive: [] },
  };
  return { group: { id: groupId, title }, plan };
}

// ─────────────────────────────────────────────────────────────────────────────
// rankSitesByUtilization
// ─────────────────────────────────────────────────────────────────────────────

describe('rankSitesByUtilization', () => {
  it('ordena infactibles antes que factibles, sin importar utilización', () => {
    const sites = [
      site('a', 'Sitio A', { weekly_available: 10, weekly_required: 5, feasible: true, deficit: 0 }), // 50%
      site('b', 'Sitio B', { weekly_available: 10, weekly_required: 12, feasible: false, deficit: 2 }), // 120%
    ];
    const ranked = rankSitesByUtilization(sites);
    expect(ranked.map((r) => r.group.id)).toEqual(['b', 'a']);
  });

  it('entre dos infactibles, ordena por mayor déficit absoluto, no por mayor % de utilización', () => {
    // Sitio C: pequeño, 150% de utilización pero solo 1 JR de déficit.
    // Sitio D: grande, 110% de utilización pero 5 JR de déficit — le urge más al Director de Operaciones.
    const sites = [
      site('c', 'Sitio C', { weekly_available: 2, weekly_required: 3, feasible: false, deficit: 1 }), // 150%
      site('d', 'Sitio D', { weekly_available: 50, weekly_required: 55, feasible: false, deficit: 5 }), // 110%
    ];
    const ranked = rankSitesByUtilization(sites);
    expect(ranked.map((r) => r.group.id)).toEqual(['d', 'c']);
  });

  it('entre dos factibles con la misma utilización, desempata por nombre', () => {
    const sites = [
      site('z', 'Zeta', { weekly_available: 10, weekly_required: 5 }),
      site('a', 'Alfa', { weekly_available: 20, weekly_required: 10 }),
    ];
    const ranked = rankSitesByUtilization(sites);
    expect(ranked.map((r) => r.group.title)).toEqual(['Alfa', 'Zeta']);
  });

  it('calcula utilizacionPct redondeado a partir de weekly_required/weekly_available', () => {
    const sites = [site('a', 'Sitio A', { weekly_available: 3, weekly_required: 1 })]; // 33.33% -> 33
    expect(rankSitesByUtilization(sites)[0].utilizacionPct).toBe(33);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeJrPareto
// ─────────────────────────────────────────────────────────────────────────────

describe('computeJrPareto', () => {
  it('agrupa por activity_key a través de sitios distintos, no por name', () => {
    const sites = [
      site('a', 'Sitio A', { activities: [activity({ activity_key: '1.09', name: 'Corte de troncos', theoretical_journals_month: 10 })] }),
      // Mismo activity_key, nombre ligeramente distinto (typo/variación de captura) — debe sumarse como UNA sola fila.
      site('b', 'Sitio B', { activities: [activity({ activity_key: '1.09', name: 'Corte de Troncos ', theoretical_journals_month: 5 })] }),
    ];
    const pareto = computeJrPareto(sites);
    expect(pareto).toHaveLength(1);
    expect(pareto[0]).toMatchObject({ activity_key: '1.09', jr: 15 });
  });

  it('no confunde dos activity_key distintos que comparten texto en el nombre', () => {
    const sites = [
      site('a', 'Sitio A', {
        activities: [
          activity({ activity_key: 'GMS_01', name: 'Actividad genérica', theoretical_journals_month: 3 }),
          activity({ activity_key: 'GMS_02', name: 'Actividad genérica', theoretical_journals_month: 7 }),
        ],
      }),
    ];
    const pareto = computeJrPareto(sites);
    expect(pareto).toHaveLength(2);
    expect(pareto.map((p) => p.jr).sort((x, y) => x - y)).toEqual([3, 7]);
  });

  it('ordena descendente por JR y calcula % y % acumulado correctamente', () => {
    const sites = [
      site('a', 'Sitio A', {
        activities: [
          activity({ activity_key: 'x1', theoretical_journals_month: 60 }),
          activity({ activity_key: 'x2', theoretical_journals_month: 40 }),
        ],
      }),
    ];
    const pareto = computeJrPareto(sites);
    expect(pareto.map((p) => p.activity_key)).toEqual(['x1', 'x2']);
    expect(pareto[0].pct).toBeCloseTo(60, 5);
    expect(pareto[0].cumulativePct).toBeCloseTo(60, 5);
    expect(pareto[1].cumulativePct).toBeCloseTo(100, 5);
  });

  it('colapsa lo que exceda topN en un punto "Otros", con acumulado contra el total real (llega a 100%)', () => {
    const activities = Array.from({ length: 12 }, (_, i) =>
      activity({ activity_key: `act-${i}`, theoretical_journals_month: 12 - i }), // 12,11,...,1
    );
    const sites = [site('a', 'Sitio A', { activities })];
    const pareto = computeJrPareto(sites, 10);

    expect(pareto).toHaveLength(11); // top 10 + "Otros"
    expect(pareto[10].activity_key).toBe('__otros__');
    expect(pareto[10].name).toBe('Otros');
    // Actividades 11 y 12 (JR 2 y 1) colapsadas en "Otros" = 3
    expect(pareto[10].jr).toBe(3);
    expect(pareto[pareto.length - 1].cumulativePct).toBeCloseTo(100, 5);
  });

  it('con 0 sitios o sitios sin actividades, devuelve un arreglo vacío sin dividir por cero', () => {
    expect(computeJrPareto([])).toEqual([]);
  });
});
