'use client';

import { AlertTriangle, MapPin, Database, Info } from 'lucide-react';
import { SchedulerMigrationMissingError } from '@/types/scheduler';

// Estados bloqueantes — reemplazan la tabla cuando no hay datos que mostrar.
// La advertencia de infactibilidad (plan existe pero supera capacidad) no
// es bloqueante y se maneja en WeeklyPlannerView directamente sobre la tabla.

interface Props {
  error: Error | null;
  noGroupSelected: boolean;
  hasNoActivities: boolean;
}

export default function PlanningWarnings({ error, noGroupSelected, hasNoActivities }: Props) {
  if (noGroupSelected) {
    return (
      <Banner icon={<MapPin className="w-8 h-8 text-[#3B7EF8]" />} color="blue">
        <p className="font-black text-sm text-white">Selecciona un sitio</p>
        <p className="text-slate-400 text-xs mt-1">
          Usa el selector de ubicación en la barra superior para elegir el sitio a planificar.
        </p>
      </Banner>
    );
  }

  if (error instanceof SchedulerMigrationMissingError) {
    return (
      <Banner icon={<Database className="w-8 h-8 text-amber-400" />} color="amber">
        <p className="font-black text-sm text-white">Migración pendiente</p>
        <p className="text-slate-400 text-xs mt-1">
          Aplica la migración{' '}
          <code className="bg-black/40 px-1 rounded text-amber-400">20260708_scheduler_engine.sql</code>{' '}
          en el Dashboard de Supabase.
        </p>
      </Banner>
    );
  }

  if (error) {
    return (
      <Banner icon={<AlertTriangle className="w-8 h-8 text-red-400" />} color="red">
        <p className="font-black text-sm text-white">Error al cargar el plan</p>
        <p className="text-slate-400 text-xs mt-1">{error.message}</p>
      </Banner>
    );
  }

  if (hasNoActivities) {
    return (
      <Banner icon={<Info className="w-8 h-8 text-slate-400" />} color="slate">
        <p className="font-black text-sm text-white">Sin estándares configurados</p>
        <p className="text-slate-400 text-xs mt-1">
          La migración está aplicada, pero no hay actividades en{' '}
          <code className="bg-black/40 px-1 rounded">board_activity_standards</code>.
        </p>
      </Banner>
    );
  }

  return null;
}

const BORDER: Record<string, string> = {
  blue:  'border-[#3B7EF8]/20 bg-[#3B7EF8]/5',
  amber: 'border-amber-500/20 bg-amber-500/5',
  red:   'border-red-500/20 bg-red-500/5',
  slate: 'border-slate-500/20 bg-slate-500/5',
};

function Banner({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-4 p-6 rounded-xl border ${BORDER[color]}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>{children}</div>
    </div>
  );
}
