'use client';

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface Props {
  weekStart: string;  // ISO date "YYYY-MM-DD"
  weekEnd: string;
  periodNumber: number;
  onPrev: () => void;
  onNext: () => void;
  onResetToCurrent?: () => void;
}

export default function WeekSelector({ weekStart, weekEnd, periodNumber, onPrev, onNext, onResetToCurrent }: Props) {
  const monthYear = new Date(weekStart + 'T00:00:00Z').toLocaleDateString('es-CO', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const label = `Semana ${periodNumber} — ${monthYear.replace(/^\w/, c => c.toUpperCase())}`;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onPrev}
        className="p-1.5 rounded-[var(--radius-control)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-subtle)] transition-all"
        aria-label="Semana anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="text-center min-w-[240px]">
        <div className="flex items-center justify-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{label}</p>
          <span
            className="text-[9px] text-[var(--text-muted)] cursor-help font-mono"
            title="Indicador derivado de posición temporal dentro del período visualizado; no constituye nueva unidad contractual ni modifica POA_VERSION."
          >
            ⓘ
          </span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
          {weekStart} → {weekEnd}
        </p>
      </div>

      <button
        onClick={onNext}
        className="p-1.5 rounded-[var(--radius-control)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-subtle)] transition-all"
        aria-label="Semana siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {onResetToCurrent && (
        <button
          onClick={onResetToCurrent}
          className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-[var(--radius-control)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-subtle)] transition-colors"
          title="Ir a Semana Actual"
        >
          <Calendar className="w-3 h-3" />
          Hoy
        </button>
      )}
    </div>
  );
}

