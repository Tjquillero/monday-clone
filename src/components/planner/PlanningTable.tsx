'use client';

import { PlanningActivity, ActivityPriority, ActivityCategory } from '@/types/scheduler';

interface Props {
  activities: PlanningActivity[];
  weeklyAvailable: number;
}

const PRIORITY_STYLE: Record<ActivityPriority, string> = {
  must_execute: 'bg-red-500/20 text-red-400 border-red-500/30',
  preferred:    'bg-[#3B7EF8]/20 text-[#3B7EF8] border-[#3B7EF8]/30',
  flexible:     'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const PRIORITY_LABEL: Record<ActivityPriority, string> = {
  must_execute: 'Obligatoria',
  preferred:    'Preferida',
  flexible:     'Flexible',
};

const CATEGORY_STYLE: Record<ActivityCategory, string> = {
  'ZONA VERDE':    'bg-green-500/15 text-green-400',
  'ZONA DURA':     'bg-amber-500/15 text-amber-400',
  'ZONA DE PLAYA': 'bg-cyan-500/15 text-cyan-400',
};

export default function PlanningTable({ activities, weeklyAvailable }: Props) {
  if (activities.length === 0) return null;

  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-color)] bg-black/20">
            <Th>Actividad</Th>
            <Th>Prioridad</Th>
            <Th>Cantidad</Th>
            <Th right>JR / Mes</Th>
            <Th right>JR / Sem</Th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a, i) => (
            <ActivityRow key={`${a.activity_key}-${i}`} activity={a} weeklyAvailable={weeklyAvailable} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  );
}

function ActivityRow({ activity: a, weeklyAvailable }: { activity: PlanningActivity; weeklyAvailable: number }) {
  const pct = weeklyAvailable > 0
    ? Math.min(100, Math.round((a.theoretical_journals_week / weeklyAvailable) * 100))
    : 0;

  return (
    <tr className="border-b border-[var(--border-color)] hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3">
        <p className="text-xs font-bold text-white leading-snug">{a.name}</p>
        <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${CATEGORY_STYLE[a.category]}`}>
          {a.category}
        </span>
      </td>

      <td className="px-4 py-3">
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${PRIORITY_STYLE[a.priority]}`}>
          {PRIORITY_LABEL[a.priority]}
        </span>
      </td>

      <td className="px-4 py-3 text-xs text-slate-300">
        <span className="font-black">{a.qty.toLocaleString('es-CO')}</span>{' '}
        <span className="text-slate-600 text-[10px]">{a.unit}</span>
      </td>

      <td className="px-4 py-3 text-right text-xs font-black text-slate-300">
        {a.theoretical_journals_month.toFixed(2)}
      </td>

      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-[#3B7EF8] rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-black text-white w-10 text-right">
            {a.theoretical_journals_week.toFixed(2)}
          </span>
        </div>
      </td>
    </tr>
  );
}
