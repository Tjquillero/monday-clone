'use client';

import Link from 'next/link';
import { AlertTriangle, MapPin, Database, Info, ShieldAlert, Wrench } from 'lucide-react';
import { SchedulerMigrationMissingError, MissingActivityStandard } from '@/types/scheduler';

// Estados bloqueantes — reemplazan la tabla cuando no hay datos que mostrar.
// La advertencia de infactibilidad (plan existe pero supera capacidad) no
// es bloqueante y se maneja en WeeklyPlannerView directamente sobre la tabla.

interface Props {
  boardId: string | undefined;
  error: Error | null;
  noGroupSelected: boolean;
  hasNoActivities: boolean;
  missingStandards: MissingActivityStandard[];
}

export default function PlanningWarnings({ boardId, error, noGroupSelected, hasNoActivities, missingStandards }: Props) {
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

  // Separación de fases (docs/architecture/poa-technical-catalog-decoupling.md):
  // el contrato puede estar importado con actividades sin rendimiento
  // configurado todavía — el Cronograma bloquea aquí, explícitamente, en vez
  // de generar un plan parcial que omita trabajo real en silencio.
  if (missingStandards.length > 0) {
    return (
      <Banner icon={<ShieldAlert className="w-8 h-8 text-red-400" />} color="red">
        <p className="font-black text-sm text-white">No es posible generar el cronograma</p>
        <p className="text-slate-400 text-xs mt-1">
          Faltan {missingStandards.length} actividad{missingStandards.length === 1 ? '' : 'es'} sin configuración
          técnica. Configure primero su rendimiento en el catálogo técnico:
        </p>
        <ul className="mt-2 space-y-0.5">
          {missingStandards.map((a) => (
            <li key={a.activity_key} className="text-[11px] text-slate-300">
              <span className="font-black text-red-400">{a.activity_key}</span> — {a.description} ({a.unit})
            </li>
          ))}
        </ul>
        {boardId && (
          <Link
            href={`/dashboard?boardId=${boardId}&view=catalogo-tecnico`}
            className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Wrench className="w-3 h-3" /> Configurar catálogo técnico
          </Link>
        )}
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
