'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUp, ArrowDown, DollarSign } from 'lucide-react';
import { WeeklyPlanningContext } from '@/types/scheduler';
import { WORKING_DAYS_MONTH } from '@/lib/schedulerMath';

// Dashboard de Costos Operativos — hace visible lo que el Scheduler ya
// calcula correctamente (ADR-0009), sin ninguna fórmula propia.
// `plan.activities` viene tal cual de useWeeklyPlan (el mismo hook que usa
// el Cronograma) — este componente solo multiplica JR/mes × costoJornal,
// suma y ordena. No reinterpreta cantidades, frecuencias ni rendimientos.
//
// Fase 2 (2026-07-19): %JR/%Costo, ordenamiento interactivo, Top 10,
// semáforos por fila, encabezado fijo al desplazar. Puramente de
// presentación — ningún cálculo nuevo, todo se deriva de theoretical_
// journals_month (ya calculado) y costoJornal (ya recibido).

interface Props {
  boardId: string | undefined;
  group: { id: string; title: string } | undefined;
  plan: WeeklyPlanningContext | null;
  costoJornal: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

type SortKey = 'codigo' | 'actividad' | 'jr' | 'costo';
type SortDirection = 'asc' | 'desc';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// Semáforo por % del total (costo si hay salario, JR si no) — mismos
// umbrales que el resto de la app (ver Agenda Operativa/CapacitySummary):
// no se inventa una escala nueva.
function semaphoreColor(pct: number): string {
  if (pct > 15) return 'bg-red-500';
  if (pct >= 5) return 'bg-amber-500';
  return 'bg-[#10B981]';
}

export default function CostosOperativosView({ group, plan, costoJornal, isLoading, isError, error }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('costo');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const activities = plan?.activities ?? [];
  const wageMissing = costoJornal <= 0;

  const rows = useMemo(() => {
    const totalJr = activities.reduce((s, a) => s + a.theoretical_journals_month, 0);
    const totalCosto = totalJr * costoJornal;
    return activities.map((a) => {
      const costo = a.theoretical_journals_month * costoJornal;
      return {
        activity: a,
        costo,
        pctJr: totalJr > 0 ? (a.theoretical_journals_month / totalJr) * 100 : 0,
        pctCosto: totalCosto > 0 ? (costo / totalCosto) * 100 : 0,
      };
    });
  }, [activities, costoJornal]);

  // Top 10 por impacto real (costo si hay salario, JR si no) — independiente
  // del ordenamiento que el usuario elija ver, para que la marca "TOP" no
  // salte de fila al cambiar de columna.
  const topKeys = useMemo(() => {
    const byImpact = [...rows].sort((r1, r2) => (wageMissing ? r2.activity.theoretical_journals_month - r1.activity.theoretical_journals_month : r2.costo - r1.costo));
    return new Set(byImpact.slice(0, 10).map((r) => r.activity.activity_key));
  }, [rows, wageMissing]);

  // Sin salario configurado, "costo" es 0 para todas las filas — ordenar por
  // esa columna sería un no-op silencioso (orden casi arbitrario, no el JR
  // más alto primero). Mismo criterio de reemplazo que ya usa topKeys.
  const effectiveSortKey: SortKey = wageMissing && sortKey === 'costo' ? 'jr' : sortKey;

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((r1, r2) => {
      switch (effectiveSortKey) {
        case 'codigo': return dir * r1.activity.activity_key.localeCompare(r2.activity.activity_key, undefined, { numeric: true });
        case 'actividad': return dir * r1.activity.name.localeCompare(r2.activity.name);
        case 'jr': return dir * (r1.activity.theoretical_journals_month - r2.activity.theoretical_journals_month);
        case 'costo': return dir * (r1.costo - r2.costo);
      }
    });
  }, [rows, effectiveSortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Calculando costos...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-red-500/30 bg-red-500/10">
          <p className="text-xs text-red-400">{error?.message ?? 'No se pudo calcular el costo operativo.'}</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6">
        <p className="text-xs text-slate-500">Selecciona un sitio para ver sus costos operativos.</p>
      </div>
    );
  }

  const totalJornales = rows.reduce((s, r) => s + r.activity.theoretical_journals_month, 0);
  const totalCosto = totalJornales * costoJornal;
  const capacidadDisponible = (plan?.zone.daily_capacity ?? 0) * WORKING_DAYS_MONTH;
  const utilizacion = capacidadDisponible > 0 ? Math.round((totalJornales / capacidadDisponible) * 100) : 0;
  const deficit = Math.max(0, totalJornales - capacidadDisponible);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="h-full overflow-auto custom-scrollbar p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#3B7EF8]" /> Costos Operativos
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">
          {group.title} — mano de obra teórica del Cronograma
        </p>
      </div>

      {wageMissing && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">
            <span className="font-black">Costo no disponible</span> — falta configurar el costo del jornal
            para esta zona en Recursos y Eficiencia. Los jornales sí están calculados; el costo en dinero no
            se puede mostrar todavía. El semáforo y el Top 10 usan % de JR mientras tanto.
          </p>
        </div>
      )}

      {/* ── Resumen superior ────────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Metric label="JR mensuales" value={totalJornales.toFixed(1)} />
          <Metric label="Costo mensual" value={wageMissing ? 'Pendiente' : formatCurrency(totalCosto)} pending={wageMissing} />
          <Metric label="Costo / jornal" value={wageMissing ? 'Pendiente' : formatCurrency(costoJornal)} pending={wageMissing} />
          <Metric label="Capacidad disponible" value={`${capacidadDisponible.toFixed(0)} JR`} />
          <Metric label="Utilización" value={`${utilizacion}%`} danger={utilizacion > 100} />
          <Metric label="Déficit" value={`${deficit.toFixed(1)} JR`} danger={deficit > 0} />
        </div>
      </div>

      {/* ── Tabla principal ─────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500 uppercase tracking-widest">
          Sin actividades planificadas para este sitio esta semana.
        </p>
      ) : (
        <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="max-h-[560px] overflow-auto custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-[#0B1220]">
                <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-[var(--border-color)]">
                  <SortableTh label="Código" sortKey="codigo" active={effectiveSortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="Actividad" sortKey="actividad" active={effectiveSortKey} dir={sortDir} onSort={handleSort} />
                  <th className="p-3">Cantidad</th>
                  <th className="p-3">Rendimiento</th>
                  <SortableTh label="JR/mes" sortKey="jr" active={effectiveSortKey} dir={sortDir} onSort={handleSort} />
                  <th className="p-3">% JR</th>
                  <SortableTh label="Costo mensual" sortKey="costo" active={effectiveSortKey} dir={sortDir} onSort={handleSort} />
                  <th className="p-3">% Costo</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ activity: a, costo, pctJr, pctCosto }) => {
                  const isTop10 = topKeys.has(a.activity_key);
                  const semaphorePct = wageMissing ? pctJr : pctCosto;
                  return (
                    <tr
                      key={a.activity_key}
                      className={`border-b border-[var(--border-color)] last:border-0 ${isTop10 ? 'bg-[#3B7EF8]/5' : ''}`}
                    >
                      <td className="p-3 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${semaphoreColor(semaphorePct)}`} title={`${semaphorePct.toFixed(1)}% del total`} />
                          {a.activity_key}
                        </div>
                      </td>
                      <td className="p-3 text-slate-300">
                        {a.name}
                        {isTop10 && (
                          <span className="ml-2 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#3B7EF8]/20 text-[#3B7EF8]">
                            Top 10
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400">{a.qty.toLocaleString('es-CO')} {a.unit}</td>
                      <td className="p-3 text-slate-400">{a.rendimiento.toLocaleString('es-CO')}</td>
                      <td className="p-3 text-slate-300">{a.theoretical_journals_month.toFixed(2)}</td>
                      <td className="p-3 text-slate-400">{pctJr.toFixed(1)}%</td>
                      <td className="p-3 text-white font-bold">
                        {wageMissing ? <span className="text-amber-400 font-normal">Pendiente</span> : formatCurrency(costo)}
                      </td>
                      <td className="p-3 text-slate-400">{wageMissing ? '—' : `${pctCosto.toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label, sortKey, active, dir, onSort,
}: { label: string; sortKey: SortKey; active: SortKey; dir: SortDirection; onSort: (k: SortKey) => void }) {
  const isActive = active === sortKey;
  return (
    <th className="p-3">
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 uppercase tracking-widest transition-colors ${isActive ? 'text-[#3B7EF8]' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {label}
        {isActive && (dir === 'desc' ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />)}
      </button>
    </th>
  );
}

function Metric({ label, value, danger = false, pending = false }: { label: string; value: string; danger?: boolean; pending?: boolean }) {
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black mt-0.5 ${pending ? 'text-amber-400' : danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}
