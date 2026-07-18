'use client';

import Link from 'next/link';
import { AlertTriangle, Circle } from 'lucide-react';
import { BoardOperationalAgendaWeek } from '@/types/scheduler';
import { SEMAPHORE_STYLE } from './semaphoreStyle';

// Bloque puro de la vista Semana (Fase 2, ADR-0006). Responde una sola
// pregunta por sitio: "¿cómo fue la semana, día por día?" — el semáforo es a
// nivel de semana completa (pct_verified_week), los puntos por día solo
// indican si hubo actividad o no ("¿qué días quedaron sin trabajo?"). Sin
// selector de semana anterior/siguiente a propósito (guardrail: la Agenda no
// es un histórico navegable).

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

interface Props {
  boardId: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  week: BoardOperationalAgendaWeek | undefined;
}

export default function AgendaSemanaBlock({ boardId, isLoading, isError, error, week }: Props) {
  if (isLoading) {
    return (
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Calculando la semana...</p>
      </div>
    );
  }

  if (isError || !week) {
    return (
      <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-red-500/30 bg-red-500/10">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs text-red-400">{error?.message ?? 'No se pudo cargar la semana.'}</p>
      </div>
    );
  }

  const cronogramaHref = (groupId: string) => `/dashboard?boardId=${boardId}&view=planner&groupId=${groupId}`;

  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
        Semana — {week.week_start} a {week.week_end}
      </p>
      {week.site_weeks.length === 0 ? (
        <p className="text-xs text-slate-500 mt-2">Ningún sitio tiene un plan activo esta semana.</p>
      ) : (
        <div className="space-y-2 mt-3">
          {week.site_weeks.map((s) => (
            <Link
              key={s.plan_id}
              href={cronogramaHref(s.group_id)}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--border-color)] hover:border-[#3B7EF8]/40 bg-black/10 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Circle className={`w-2.5 h-2.5 shrink-0 ${SEMAPHORE_STYLE[s.semaphore]}`} />
                <span className="text-[10px] font-bold text-white uppercase tracking-tight truncate">{s.group_title}</span>
                <span className="text-[9px] font-mono text-slate-500 shrink-0">{s.pct_verified_week}%</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {s.days.map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-0.5">
                    <span className="text-[7px] font-black uppercase text-slate-600">
                      {DAY_LABELS[new Date(d.date + 'T00:00:00Z').getUTCDay() - 1] ?? ''}
                    </span>
                    <div
                      className={`w-2.5 h-2.5 rounded-full border ${
                        d.has_activity
                          ? 'bg-[#3B7EF8] border-[#3B7EF8]'
                          : 'bg-transparent border-slate-700'
                      }`}
                      title={d.has_activity ? 'Con actividad' : 'Sin trabajo'}
                    />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
