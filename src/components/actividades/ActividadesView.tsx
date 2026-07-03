'use client';

// Superficie del LÍDER — vista pura de solo lectura.
// Muestra los weekly_plan_items del plan publicado/en ejecución de cada sitio
// para la semana activa. El registro de jornadas (createExecution →
// reportExecution) se conecta en la siguiente etapa.

import { MapPin, ClipboardCheck } from 'lucide-react';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { ActivityPriority, PlanStatus } from '@/types/scheduler';

interface Props {
  plans: PublishedWeekPlan[];
}

const PRIORITY_LABEL: Record<ActivityPriority, { text: string; cls: string }> = {
  must_execute: { text: 'Obligatoria', cls: 'bg-red-50 text-red-600 border-red-200' },
  preferred: { text: 'Preferente', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  flexible: { text: 'Flexible', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const PLAN_STATUS_LABEL: Partial<Record<PlanStatus, { text: string; cls: string }>> = {
  published: { text: 'Publicado', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  in_progress: { text: 'En ejecución', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function ItemRow({ item }: { item: PublishedWeekPlanItem }) {
  const priority = PRIORITY_LABEL[item.priority] ?? PRIORITY_LABEL.flexible;
  const progress = item.planned_qty > 0
    ? Math.min(100, Math.round((item.executed_qty / item.planned_qty) * 100))
    : 0;

  return (
    <div className="grid grid-cols-[1fr] md:grid-cols-[1fr_110px_140px_140px_160px] px-4 md:px-6 py-4 items-center gap-2 md:gap-0 hover:bg-slate-50/80 transition-colors">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {item.standard?.name ?? item.activity_key}
        </p>
        {item.standard?.category && (
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">{item.standard.category}</p>
        )}
      </div>

      <div>
        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${priority.cls}`}>
          {priority.text}
        </span>
      </div>

      <div className="text-sm text-slate-600">
        <span className="font-semibold text-slate-800">{formatNumber(item.planned_qty)}</span>
        {' '}{item.unit}
        <p className="text-[11px] text-slate-400">planificado</p>
      </div>

      <div className="text-sm text-slate-600">
        <span className="font-semibold text-slate-800">{formatNumber(item.executed_qty)}</span>
        {' '}{item.unit}
        <p className="text-[11px] text-slate-400">ejecutado</p>
      </div>

      <div className="pr-1">
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
          <span>{formatNumber(item.executed_jr)} / {formatNumber(item.planned_jr)} JR</span>
          <span className="font-semibold">{progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ActividadesView({ plans }: Props) {
  return (
    <div className="space-y-6">
      {plans.map((plan) => {
        const status = PLAN_STATUS_LABEL[plan.status];
        return (
          <section key={plan.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 shrink-0" style={{ color: plan.group?.color ?? '#3B7EF8' }} />
                <h2 className="text-sm font-bold text-slate-800 truncate">
                  {plan.group?.title ?? 'Sitio'}
                </h2>
                <span className="text-[11px] text-slate-400 truncate">· {plan.board?.name ?? 'Tablero'}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-slate-400">
                  {plan.items.length} {plan.items.length === 1 ? 'actividad' : 'actividades'}
                </span>
                {status && (
                  <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${status.cls}`}>
                    {status.text}
                  </span>
                )}
              </div>
            </header>

            <div className="hidden md:grid grid-cols-[1fr_110px_140px_140px_160px] border-b border-slate-100 px-6 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div>Actividad</div>
              <div>Prioridad</div>
              <div>Planificado</div>
              <div>Ejecutado</div>
              <div>Avance (JR)</div>
            </div>

            <div className="divide-y divide-slate-100">
              {plan.items.length > 0 ? (
                plan.items.map((item) => <ItemRow key={item.id} item={item} />)
              ) : (
                <div className="px-6 py-8 text-center text-sm text-slate-400">
                  <ClipboardCheck className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  El plan de este sitio no tiene actividades.
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
