'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  weekStart: string;  // ISO date "YYYY-MM-DD"
  weekEnd: string;
  periodNumber: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function WeekSelector({ weekStart, weekEnd, periodNumber, onPrev, onNext }: Props) {
  const monthYear = new Date(weekStart + 'T00:00:00Z').toLocaleDateString('es-CO', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const label = `Período ${periodNumber} — ${monthYear.replace(/^\w/, c => c.toUpperCase())}`;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onPrev}
        className="p-1.5 rounded-lg border border-[var(--border-color)] text-slate-400 hover:text-white hover:border-[#3B7EF8]/40 transition-all"
        aria-label="Período anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="text-center min-w-[220px]">
        <p className="text-xs font-black uppercase tracking-widest text-white">{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {weekStart} → {weekEnd}
        </p>
      </div>

      <button
        onClick={onNext}
        className="p-1.5 rounded-lg border border-[var(--border-color)] text-slate-400 hover:text-white hover:border-[#3B7EF8]/40 transition-all"
        aria-label="Período siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
