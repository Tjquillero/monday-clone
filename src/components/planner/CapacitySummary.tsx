'use client';

import { WeeklyPlanningContext } from '@/types/scheduler';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Proyección de Capacidad Semanal — {zone.name}
          </p>
          <span
            className="text-[9px] text-slate-500 cursor-help"
            title="Cálculo derivado de jornales teóricos de actividades planificadas vs disponibilidad de la zona. No muta POA ni base de datos."
          >
            ⓘ
          </span>
        </div>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
          feasible
            ? 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/30'
            : 'text-red-400 bg-red-500/10 border-red-500/30'
        }`}>
          {feasible ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {feasible ? 'Capacidad Factible' : 'Déficit de Capacidad'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Disponible (Sitio)" value={`${capacity.weekly_available} JR`} sub={`${zone.daily_capacity} JR/día`} />
        <Metric label="Requerido (Plan)" value={`${capacity.weekly_required.toFixed(2)} JR`} danger={!feasible} />
        <Metric label="Tasa de Utilización" value={`${pct}%`} danger={pct > 100} warning={pct >= 85 && pct <= 100} />
      </div>

      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct > 100
              ? 'bg-red-500'
              : pct >= 85
              ? 'bg-amber-400'
              : 'bg-[#10B981]'
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {!feasible && capacity.deficit > 0 && (
        <p className="text-[10px] text-red-400 font-medium">
          ⚠️ Déficit detectado: <span className="font-black">{capacity.deficit.toFixed(2)} JR</span> — requiere ajustar distribución de días o capacidad contratada.
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  danger = false,
  warning = false,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  warning?: boolean;
}) {
  const colorClass = danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-white';

  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black mt-0.5 ${colorClass}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-600 mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}

