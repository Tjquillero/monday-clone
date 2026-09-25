'use client';

// Componente Puro de Presentación: DaySection
// Renderiza las actividades asignadas a un día calendario específico (planned_date)
// Cero recálculos de fecha/programación — consume datos DTO ya agrupados.

import { useState } from 'react';
import { Calendar, ChevronDown, CalendarOff, CheckCircle2 } from 'lucide-react';
import { PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { isOperationalWorkingDay } from '@/lib/routineScheduler';

interface DaySectionProps {
  dateStr: string; // ISO YYYY-MM-DD
  items: PublishedWeekPlanItem[];
  planId: string;
  groupId: string;
  renderItemRow: (item: PublishedWeekPlanItem, planId: string, groupId: string) => React.ReactNode;
  isContingency?: boolean;
}

function formatDayHeader(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);

  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  const dayOfWeek = days[date.getDay()] || '';
  const monthStr = months[month] || '';
  const dayNum = String(day).padStart(2, '0');

  return `${dayOfWeek} ${dayNum} ${monthStr}`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function DaySection({
  dateStr,
  items,
  planId,
  groupId,
  renderItemRow,
  isContingency = false,
}: DaySectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isWorking = isContingency ? false : isOperationalWorkingDay(dateStr);
  const totalPlannedJr = items.reduce((acc, i) => acc + (i.planned_jr || 0), 0);
  const dayLabel = isContingency ? 'OCURRENCIAS SIN FECHA ASIGNADA' : formatDayHeader(dateStr);

  return (
    <div className={`border rounded-[var(--radius-control)] overflow-hidden transition-all text-[var(--text-primary)] ${
      isContingency
        ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning-subtle)]'
        : isWorking
          ? 'border-[var(--border-color)] bg-[var(--card-bg)]'
          : 'border-[var(--border-color)] bg-[var(--color-surface-subtle)]'
    }`}>
      {/* Encabezado del Día */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-4 md:px-5 py-3 flex items-center justify-between text-left hover:bg-[var(--color-surface-subtle)] transition-colors select-none"
      >
        <div className="flex items-center space-x-3 min-w-0">
          <Calendar className={`w-4 h-4 shrink-0 ${
            isContingency ? 'text-[var(--color-warning)]' : isWorking ? 'text-[var(--color-primary)]' : 'text-[var(--text-muted)]'
          }`} />
          <span className={`text-xs md:text-sm font-bold font-brand tracking-wide ${
            isContingency ? 'text-[var(--color-warning)]' : isWorking ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
          }`}>
            {dayLabel}
          </span>

          {!isWorking && !isContingency && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-surface-subtle)] text-[var(--text-muted)] uppercase tracking-wider border border-[var(--border-color)]">
              No Laborable
            </span>
          )}

          {isContingency && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-warning-subtle)] text-[var(--color-warning)] uppercase tracking-wider border border-[var(--color-warning)]/30">
              Contingencia
            </span>
          )}
        </div>

        <div className="flex items-center space-x-4 shrink-0">
          {items.length > 0 && (
            <div className="text-[11px] md:text-xs text-[var(--text-muted)] flex items-center space-x-3">
              <span className="font-semibold text-[var(--text-secondary)]">{items.length} {items.length === 1 ? 'actividad' : 'actividades'}</span>
              <span className="text-[var(--border-color)]">|</span>
              <span className="font-bold font-mono text-[var(--color-primary)]">{formatNumber(totalPlannedJr)} JR</span>
            </div>
          )}

          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </div>
      </button>

      {/* Contenido del Día (si no está colapsado) */}
      {!collapsed && (
        <div className="border-t border-[var(--border-color)]">
          {items.length > 0 ? (
            <div className="divide-y divide-[var(--border-color)]">
              {items.map((item) => renderItemRow(item, planId, groupId))}
            </div>
          ) : (
            <div className="px-5 py-4 text-xs text-[var(--text-muted)] flex items-center space-x-2">
              {!isWorking ? (
                <>
                  <CalendarOff className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <span>Día no laborable / Descanso operativo programado.</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] shrink-0" />
                  <span>Sin actividades programadas para este día.</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
