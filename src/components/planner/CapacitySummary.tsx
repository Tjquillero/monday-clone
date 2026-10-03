'use client';

import { WeeklyPlanningContext, WeeklyPlanItem } from '@/types/scheduler';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

export interface DailyCapacityDetailItem {
  dateStr: string;
  dayName: string;
  dayNumber: number;
  isWorking: boolean;
  isHoliday?: boolean;
  holidayName?: string | null;
  countingJournals: number;
  machineJournals: number;
  capacity: number | null;
  deficit: number;
  exceeded: boolean;
}

export interface CarryoverItemDisplay {
  activity_key: string;
  qty: number;
  jr: number;
  reason?: string;
}

export interface RecurrentExceedsDisplay {
  dateStr: string;
  deficit_jr: number;
}

interface Props {
  plan?: WeeklyPlanningContext | null;
  siteDailyCapacity?: number | null;
  workingDaysCount?: number;
  dailyDetails?: DailyCapacityDetailItem[];
  zoneName?: string;
  carryoverNextMonth?: CarryoverItemDisplay[];
  carryoverNextMonthProjection?: CarryoverItemDisplay[];
  carryoverFromThisWeek?: CarryoverItemDisplay[];
  recurrentExceedsCapacity?: RecurrentExceedsDisplay[];
}

export default function CapacitySummary({
  plan,
  siteDailyCapacity,
  workingDaysCount,
  dailyDetails,
  zoneName,
  carryoverNextMonth,
  carryoverNextMonthProjection,
  carryoverFromThisWeek,
  recurrentExceedsCapacity,
}: Props) {
  const zoneTitle = zoneName || plan?.zone.name || 'Sitio';

  // Capacidad diaria del sitio (B3: site_daily_capacity)
  const capPerDay = siteDailyCapacity !== undefined && siteDailyCapacity !== null
    ? siteDailyCapacity
    : (plan?.zone.daily_capacity && plan.zone.daily_capacity > 0 ? plan.zone.daily_capacity : null);

  const numWorkingDays = workingDaysCount ?? (plan?.week.working_days ?? 6);

  // Capacidad semanal = site_daily_capacity * días hábiles de la semana
  const weeklyCapacity = capPerDay !== null && capPerDay > 0
    ? Number((capPerDay * numWorkingDays).toFixed(2))
    : null;

  // Cómputos de jornales
  let totalCounting = 0;
  let totalMachine = 0;
  let totalDeficit = 0;
  let hasExceededDay = false;

  if (dailyDetails && dailyDetails.length > 0) {
    for (const d of dailyDetails) {
      totalCounting += d.countingJournals;
      totalMachine += d.machineJournals;
      totalDeficit += d.deficit;
      if (d.exceeded) hasExceededDay = true;
    }
  } else if (plan) {
    totalCounting = plan.capacity.weekly_required;
    totalDeficit = plan.capacity.deficit;
    hasExceededDay = !plan.capacity.feasible;
  }

  totalCounting = Number(totalCounting.toFixed(2));
  totalMachine = Number(totalMachine.toFixed(2));
  totalDeficit = Number(totalDeficit.toFixed(2));

  // B4: Tolerancia de 0.005 en la verificación de capacidad
  const isWeeklyExceeded = weeklyCapacity !== null && totalCounting > weeklyCapacity + 0.005;
  const feasible = !hasExceededDay && !isWeeklyExceeded;

  const pct = weeklyCapacity && weeklyCapacity > 0
    ? Math.round((totalCounting / weeklyCapacity) * 100)
    : 0;
  const clamped = Math.min(pct, 100);

  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
      {/* ── Encabezado ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Proyección de Capacidad Semanal — {zoneTitle}
          </p>
          <span
            className="text-[9px] text-slate-500 cursor-help"
            title="Cálculo basado en site_daily_capacity × días hábiles. Actividades de máquina están excluidas de la capacidad (D28)."
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

      {/* ── Métricas Globales ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Disponible (Sitio)"
          value={weeklyCapacity !== null ? `${weeklyCapacity} JR` : 'Sin límite'}
          sub={capPerDay !== null ? `${capPerDay} JR/día (${numWorkingDays} días hábiles)` : 'Sin límite configurado'}
        />
        <Metric
          label="Requerido (Plan)"
          value={`${totalCounting.toFixed(2)} JR`}
          sub={totalMachine > 0 ? `+${totalMachine.toFixed(2)} JR de máquina (excluidos)` : '0.00 JR de máquina'}
          danger={!feasible}
        />
        <Metric
          label="Tasa de Utilización"
          value={weeklyCapacity !== null ? `${pct}%` : 'N/A'}
          danger={pct > 100}
          warning={pct >= 85 && pct <= 100}
        />
      </div>

      {/* ── Barra de Utilización ────────────────────────────────── */}
      {weeklyCapacity !== null && (
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
      )}

      {/* ── Detalle Diario (B3: por día los jornales que cuentan, los de máquina y el déficit) ── */}
      {dailyDetails && dailyDetails.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-color)]/60">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Desglose Diario de Capacidad (Lunes – Sábado)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {dailyDetails.map((d) => {
              const isExceeded = d.exceeded;
              return (
                <div
                  key={d.dateStr || d.dayName}
                  className={`rounded-lg p-2 text-center border ${
                    !d.isWorking
                      ? 'bg-slate-900/40 border-slate-800/40 text-slate-600'
                      : isExceeded
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-black/20 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 mb-1">
                    <span>{d.dayName}</span>
                    {d.dateStr && <span className="font-mono text-[8px] text-slate-500">{d.dateStr.slice(8, 10)}/{d.dateStr.slice(5, 7)}</span>}
                  </div>
                  {d.isWorking ? (
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-black text-white">
                        {d.countingJournals.toFixed(2)} <span className="text-[8px] text-slate-400 font-normal">JR</span>
                      </div>
                      {d.machineJournals > 0 && (
                        <div className="text-[8px] text-cyan-400 font-mono">
                          +{d.machineJournals.toFixed(2)} Máq
                        </div>
                      )}
                      {isExceeded ? (
                        <div className="text-[8px] font-black text-red-400 bg-red-500/20 rounded px-1 mt-0.5">
                          Déficit +{d.deficit.toFixed(2)}
                        </div>
                      ) : (
                        <div className="text-[8px] text-slate-500 font-mono">
                          {capPerDay !== null ? `Cap ${capPerDay}` : 'OK'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-600 font-mono py-1">
                      {d.isHoliday ? 'Festivo' : 'No lab'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Aviso de Déficit ────────────────────────────────────── */}
      {!feasible && totalDeficit > 0 && (
        <p className="text-[10px] text-red-400 font-medium">
          ⚠️ Déficit detectado: <span className="font-black">{totalDeficit.toFixed(2)} JR</span> — requiere ajustar distribución de días o capacidad contratada.
        </p>
      )}

      {/* ── D30.6 / B4: Sección "Pasa al próximo mes (proyección del mes)" y "De esta semana" ── */}
      {((carryoverNextMonthProjection && carryoverNextMonthProjection.length > 0) ||
        (carryoverNextMonth && carryoverNextMonth.length > 0) ||
        (carryoverFromThisWeek && carryoverFromThisWeek.length > 0)) && (
        <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-2">
          {/* Proyección del mes */}
          {((carryoverNextMonthProjection && carryoverNextMonthProjection.length > 0) ||
            (carryoverNextMonth && carryoverNextMonth.length > 0)) && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1.5 flex items-center gap-1">
                <span>Pasa al próximo mes (proyección del mes)</span>
              </p>
              <div className="space-y-1">
                {(carryoverNextMonthProjection || carryoverNextMonth || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[10px] bg-black/20 px-2 py-1 rounded border border-white/5"
                  >
                    <span className="font-mono font-bold text-slate-300">{item.activity_key}</span>
                    <span className="text-slate-400">
                      {item.qty} cant ({item.jr.toFixed(2)} JR)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* De esta semana */}
          {carryoverFromThisWeek && carryoverFromThisWeek.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-1 flex items-center gap-1">
                <span>De esta semana</span>
              </p>
              <div className="space-y-1">
                {carryoverFromThisWeek.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[10px] bg-black/20 px-2 py-1 rounded border border-white/5"
                  >
                    <span className="font-mono font-bold text-slate-300">{item.activity_key}</span>
                    <span className="text-slate-400">
                      {item.qty} cant ({item.jr.toFixed(2)} JR)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── D30.6: Aviso de Recurrentes Exceden Capacidad ───────── */}
      {recurrentExceedsCapacity && recurrentExceedsCapacity.length > 0 && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-medium flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Recurrentes exceden el límite: revisar límite o rendimientos</span>
        </div>
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
