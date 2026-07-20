import { BoardSitePlan } from './weeklyPlanner';

// ─────────────────────────────────────────────────────────────────────────────
// executiveIndicators
//
// Agregaciones puras a nivel de board sobre BoardSitePlan[] (ver
// buildBoardPlanningContexts en weeklyPlanner.ts) — sin fórmula propia de
// jornales, solo lectura/orden/agrupación de lo que el motor ya calculó.
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteRanking {
  group: { id: string; title: string };
  utilizacionPct: number;
  deficit: number;
  feasible: boolean;
}

// Orden pensado para el Director de Operaciones: no basta con "quién tiene
// mayor %" — dos sitios pueden estar ambos sobre el 100%, y el que más
// urge atender es el de mayor déficit ABSOLUTO de jornales, no el de mayor
// porcentaje (un sitio pequeño al 150% puede pesar menos que uno grande al
// 110%). Orden: (1) infactibles antes que factibles, (2) entre infactibles,
// mayor déficit primero, (3) utilización % descendente, (4) nombre.
export function rankSitesByUtilization(sites: BoardSitePlan[]): SiteRanking[] {
  const ranked: SiteRanking[] = sites.map(({ group, plan }) => {
    const { weekly_available, weekly_required, feasible, deficit } = plan.capacity;
    const utilizacionPct = weekly_available > 0 ? Math.round((weekly_required / weekly_available) * 100) : 0;
    return { group, utilizacionPct, deficit, feasible };
  });

  ranked.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? 1 : -1;
    if (!a.feasible && !b.feasible && a.deficit !== b.deficit) return b.deficit - a.deficit;
    if (a.utilizacionPct !== b.utilizacionPct) return b.utilizacionPct - a.utilizacionPct;
    return a.group.title.localeCompare(b.group.title);
  });

  return ranked;
}

export interface ParetoPoint {
  activity_key: string;
  /** Solo presentación — el agrupamiento siempre es por activity_key, nunca por nombre (ver nota abajo). */
  name: string;
  jr: number;
  pct: number;
  cumulativePct: number;
}

// Agrupa SIEMPRE por activity_key, nunca por `name`: dos actividades de
// sitios distintos pueden compartir texto en el nombre sin ser la misma
// actividad (y viceversa) — agrupar por heurística de texto es exactamente
// el tipo de equivalencia no verificada que ADR-0008 prohíbe persistir sin
// confirmación explícita. `name` viaja en el punto solo para mostrarlo.
//
// Con más de `topN` actividades, las restantes se colapsan en un punto
// "Otros" para que el gráfico siga siendo legible — pero `cumulativePct` se
// calcula siempre contra el total real (todas las actividades, no solo las
// mostradas), así el acumulado del último punto sigue llegando a 100%.
export function computeJrPareto(sites: BoardSitePlan[], topN = 10): ParetoPoint[] {
  const byKey = new Map<string, { name: string; jr: number }>();
  for (const { plan } of sites) {
    for (const a of plan.activities) {
      const existing = byKey.get(a.activity_key);
      if (existing) {
        existing.jr += a.theoretical_journals_month;
      } else {
        byKey.set(a.activity_key, { name: a.name, jr: a.theoretical_journals_month });
      }
    }
  }

  const all = Array.from(byKey.entries())
    .map(([activity_key, v]) => ({ activity_key, name: v.name, jr: v.jr }))
    .sort((a, b) => b.jr - a.jr);

  const totalJr = all.reduce((s, a) => s + a.jr, 0);

  const top = all.slice(0, topN);
  const rest = all.slice(topN);

  const points: { activity_key: string; name: string; jr: number }[] = [...top];
  if (rest.length > 0) {
    points.push({
      activity_key: '__otros__',
      name: 'Otros',
      jr: rest.reduce((s, a) => s + a.jr, 0),
    });
  }

  let cumulative = 0;
  return points.map((p) => {
    cumulative += p.jr;
    return {
      activity_key: p.activity_key,
      name: p.name,
      jr: p.jr,
      pct: totalJr > 0 ? (p.jr / totalJr) * 100 : 0,
      cumulativePct: totalJr > 0 ? (cumulative / totalJr) * 100 : 0,
    };
  });
}
