'use client';

// Superficie del LÍDER — actividades del plan publicado/en ejecución de cada
// sitio para la semana activa. Proyección UX operacional por día calendario
// (Sitio -> Semana -> Día -> Actividad). Consume planned_date persistido.

import { useState } from 'react';
import { MapPin, ClipboardCheck, ChevronDown } from 'lucide-react';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { ActivityPriority, PlanStatus } from '@/types/scheduler';
import ItemExecutions from './ItemExecutions';
import DaySection from './DaySection';

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

function getWeekDays(weekStartISO: string): string[] {
  const parts = weekStartISO.split('-');
  if (parts.length !== 3) return [];
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(year, month, day + i);
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const dStr = String(d.getDate()).padStart(2, '0');
    days.push(`${yStr}-${mStr}-${dStr}`);
  }
  return days;
}

export function ItemRow({ item, planId, groupId }: { item: PublishedWeekPlanItem; planId: string; groupId: string }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_LABEL[item.priority] ?? PRIORITY_LABEL.flexible;
  const progress = item.planned_qty > 0
    ? Math.min(100, Math.round((item.executed_qty / item.planned_qty) * 100))
    : 0;

  const name = item.standard?.name ?? item.name ?? item.activity_key;
  const category = item.standard?.category ?? item.zone;

  return (
    <div className="border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50/60 transition-colors">
      <div
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 md:px-6 md:py-4 cursor-pointer select-none flex flex-col md:grid md:grid-cols-[1fr_110px_140px_140px_160px_32px] md:items-center gap-3 md:gap-0"
      >
        <div className="min-w-0 md:pr-4">
          <div className="flex items-start justify-between md:justify-start gap-2">
            <p className="text-sm md:text-base font-semibold text-slate-800 leading-snug truncate">
              {name}
            </p>
            <span className={`md:hidden shrink-0 inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${priority.cls}`}>
              {priority.text}
            </span>
          </div>
          {category && (
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mt-0.5">
              {category}
            </p>
          )}
        </div>

        <div className="hidden md:block">
          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${priority.cls}`}>
            {priority.text}
          </span>
        </div>

        <div className="text-xs md:text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{formatNumber(item.planned_qty)}</span>
          {' '}{item.unit}
          <span className="text-[11px] text-slate-400 block">planificado</span>
        </div>

        <div className="text-xs md:text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{formatNumber(item.executed_qty)}</span>
          {' '}{item.unit}
          <span className="text-[11px] text-slate-400 block">ejecutado</span>
        </div>

        <div className="md:pr-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>{formatNumber(item.executed_jr)} / {formatNumber(item.planned_jr)} JR</span>
            <span className="font-semibold text-slate-700">{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          <span className="text-xs font-semibold text-blue-600 md:hidden">
            {expanded ? 'Ocultar jornadas' : 'Registrar avance / Ver jornadas'}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="p-4 bg-slate-50/50 border-t border-slate-100">
          <ItemExecutions planId={planId} groupId={groupId} planItemId={item.id} unit={item.unit} />
        </div>
      )}
    </div>
  );
}

export default function ActividadesView({ plans }: Props) {
  return (
    <div className="space-y-8">
      {plans.map((plan) => {
        const status = PLAN_STATUS_LABEL[plan.status];
        const weekDays = getWeekDays(plan.week_start);
        const weekDaySet = new Set(weekDays);

        // Agrupar items por planned_date (preservando orden determinista)
        const itemsByDay = new Map<string, PublishedWeekPlanItem[]>();
        const contingencyItems: PublishedWeekPlanItem[] = [];

        for (const item of plan.items) {
          const pDate = item.planned_date?.trim();
          if (pDate && weekDaySet.has(pDate)) {
            const list = itemsByDay.get(pDate) ?? [];
            list.push(item);
            itemsByDay.set(pDate, list);
          } else {
            contingencyItems.push(item);
          }
        }

        const totalPlannedJr = plan.items.reduce((acc, i) => acc + (i.planned_jr || 0), 0);

        return (
          <section key={plan.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header del Sitio */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <MapPin className="w-5 h-5 shrink-0" style={{ color: plan.group?.color ?? '#3B7EF8' }} />
                <div>
                  <h2 className="text-base font-bold text-slate-800 truncate">
                    {plan.group?.title ?? 'Sitio'}
                  </h2>
                  <p className="text-xs text-slate-500 truncate">{plan.board?.name ?? 'Tablero Principal'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right text-xs">
                  <span className="font-semibold text-slate-700">{plan.items.length} actividades</span>
                  <span className="text-slate-300 mx-1.5">•</span>
                  <span className="font-bold text-blue-600">{formatNumber(totalPlannedJr)} JR total</span>
                </div>
                {status && (
                  <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${status.cls}`}>
                    {status.text}
                  </span>
                )}
              </div>
            </header>

            {/* Proyección Desglose Semanal por Día (Lunes a Domingo) */}
            <div className="p-4 md:p-6 space-y-4 bg-slate-50/30">
              {weekDays.map((dayISO) => (
                <DaySection
                  key={dayISO}
                  dateStr={dayISO}
                  items={itemsByDay.get(dayISO) ?? []}
                  planId={plan.id}
                  groupId={plan.group_id}
                  renderItemRow={(item, pId, gId) => (
                    <ItemRow key={item.id} item={item} planId={pId} groupId={gId} />
                  )}
                />
              ))}

              {/* Contingencia: Ocurrencias con fecha fuera de rango o nula */}
              {contingencyItems.length > 0 && (
                <DaySection
                  dateStr="CONTINGENCY"
                  items={contingencyItems}
                  planId={plan.id}
                  groupId={plan.group_id}
                  renderItemRow={(item, pId, gId) => (
                    <ItemRow key={item.id} item={item} planId={pId} groupId={gId} />
                  )}
                  isContingency={true}
                />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
