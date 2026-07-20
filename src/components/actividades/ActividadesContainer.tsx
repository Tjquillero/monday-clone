'use client';

// Superficie del LÍDER — container de Mis actividades.
// Obtiene los planes publicados/en ejecución de la semana activa (todos los
// boards visibles vía RLS) y delega el render a la vista pura. Solo lectura:
// el registro de jornadas se conecta en la siguiente etapa.

import { useMemo } from 'react';
import { Loader2, CalendarX2, AlertTriangle } from 'lucide-react';
import { usePublishedWeekPlans } from '@/hooks/useWeeklyPlans';
import { getMonday, getWeekBounds, getBogotaToday } from '@/lib/weeklyPlanner';
import ActividadesView from './ActividadesView';

function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export default function ActividadesContainer() {
  const week = useMemo(() => {
    const monday = getMonday(getBogotaToday());
    return getWeekBounds(monday);
  }, []);

  const { data: plans, isLoading, isError, error } = usePublishedWeekPlans(week.start);

  return (
    <div>
      <p className="text-sm text-slate-500 mb-6">
        Semana del <span className="font-semibold text-slate-700">{formatDayMonth(week.start)}</span> al{' '}
        <span className="font-semibold text-slate-700">{formatDayMonth(week.end)}</span> — actividades del
        plan publicado de cada sitio.
      </p>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium">Cargando el plan de la semana…</p>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 bg-red-50/50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-4" />
          <p className="text-red-500 font-medium">No se pudo cargar el plan de la semana.</p>
          <p className="text-xs text-red-400 mt-1">{error instanceof Error ? error.message : 'Error desconocido'}</p>
        </div>
      )}

      {!isLoading && !isError && (plans?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
          <CalendarX2 className="w-8 h-8 text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">No hay plan publicado para esta semana.</p>
          <p className="text-xs text-slate-400 mt-1">
            Cuando el asistente publique el cronograma, tus actividades aparecerán aquí.
          </p>
        </div>
      )}

      {!isLoading && !isError && plans && plans.length > 0 && <ActividadesView plans={plans} />}
    </div>
  );
}
