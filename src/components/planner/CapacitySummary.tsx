'use client';

import { WeeklyPlanningContext } from '@/types/scheduler';

interface Props {
  plan: WeeklyPlanningContext;
}

export default function CapacitySummary({ plan }: Props) {
  const { capacity, zone } = plan;
  const pct = capacity.weekly_available > 0
    ? Math.round((capacity.weekly_required / capacity.weekly_available) * 100)
    : 0;
  const clamped = Math.min(pct, 100);
  const feasible = capacity.feasible;

  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Capacidad semanal — {zone.name}
        </p>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
          feasible
            ? 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/30'
            : 'text-red-400 bg-red-500/10 border-red-500/30'
        }`}>
          {feasible ? 'Factible' : 'Déficit'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Disponible" value={`${capacity.weekly_available} JR`} sub={`${zone.daily_capacity} JR/día`} />
        <Metric label="Requerido" value={`${capacity.weekly_required.toFixed(2)} JR`} danger={!feasible} />
        <Metric label="Utilización" value={`${pct}%`} danger={pct > 100} />
      </div>

      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${feasible ? 'bg-[#10B981]' : 'bg-red-500'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {!feasible && capacity.deficit > 0 && (
        <p className="text-[10px] text-red-400">
          Déficit: <span className="font-black">{capacity.deficit.toFixed(2)} JR</span> — reducir carga o ampliar cuadrilla
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, sub, danger = false }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black mt-0.5 ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}
