'use client';

// Superficie del LÍDER — Container de Mis Actividades (/my-work)
// Implementa la Jerarquía Progresiva de 3 Niveles (SITIOS -> ACTIVIDADES -> REGISTRO DE EJECUCIÓN -> EVIDENCIA).
// Nivel 1: Lista de Sitios (SiteListView) cuando selectedGroupId === null
// Nivel 2: Detalle del Sitio (ActividadesView) cuando selectedGroupId !== null
// Consumo soberano de usePublishedWeekPlans y evaluateDailyOperationalBrief sin mutaciones.

import { useMemo, useState } from 'react';
import { CalendarX2, AlertTriangle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { usePublishedWeekPlans } from '@/hooks/useWeeklyPlans';
import { useAuth } from '@/contexts/AuthContext';
import { getMonday, getWeekBounds, getBogotaToday } from '@/lib/weeklyPlanner';
import { evaluateDailyOperationalBrief, DailyOperationalBrief } from '@/lib/dailyOperationalBriefService';
import DailyBriefBanner from './DailyBriefBanner';
import SiteListView from './SiteListView';
import ActividadesView from './ActividadesView';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { FieldReportResult } from '@/lib/fieldWorkflowExecutionService';

function formatDayMonth(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const day = parts[2];
  const month = parts[1];
  return `${day}/${month}`;
}

export default function ActividadesContainer() {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  // Control de Semana Activa
  const todayBogotaDate = useMemo(() => getBogotaToday(), []);
  const defaultMonday = useMemo(() => {
    return getMonday(todayBogotaDate).toISOString().substring(0, 10);
  }, [todayBogotaDate]);

  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(defaultMonday);

  const todayBogotaISO: string = useMemo(() => {
    return todayBogotaDate.toISOString().substring(0, 10);
  }, [todayBogotaDate]);

  const week = useMemo(() => {
    const parts = selectedWeekStart.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const monday = new Date(year, month, day);
    return getWeekBounds(monday);
  }, [selectedWeekStart]);

  const { data: plans, isLoading, isError, error, refetch } = usePublishedWeekPlans(week.start);

  // Proyección soberana del Daily Operational Brief (DOB)
  const dailyBrief: DailyOperationalBrief = useMemo(() => {
    if (!plans || plans.length === 0) {
      return evaluateDailyOperationalBrief({
        evaluationDate: todayBogotaISO,
        boardId: 'default-board',
        crewId: 'default-crew',
        weeklyPlanItems: [],
        executionRecords: [],
      });
    }

    const allWeeklyPlanItems: WeeklyPlanItem[] = [];
    const firstBoardId = plans[0].board_id || 'default-board';

    for (const plan of plans) {
      for (const item of plan.items) {
        const itemPlannedDate = item.planned_date
          ? (typeof item.planned_date === 'string' ? item.planned_date : new Date(item.planned_date).toISOString().substring(0, 10))
          : todayBogotaISO;

        allWeeklyPlanItems.push({
          id: item.id,
          weekly_plan_id: plan.id,
          board_id: plan.board_id,
          group_id: plan.group_id,
          activity_key: item.activity_key,
          name: item.standard?.name || item.name || item.activity_key,
          zone: item.zone || item.standard?.category || 'Zona General',
          unit: item.unit || 'und',
          planned_date: itemPlannedDate,
          planned_qty: item.planned_qty || 0,
          theoretical_jr: item.planned_jr || 0,
          source_type: 'ROUTINE',
          routine_reference: item.id,
          occurrence_key: item.id,
          is_manual_override: false,
          status: (item as any).status || 'planned',
          crew_id: item.crew_id || null,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
        });
      }
    }

    return evaluateDailyOperationalBrief({
      evaluationDate: todayBogotaISO,
      boardId: firstBoardId,
      crewId: 'crew-active',
      weeklyPlanItems: allWeeklyPlanItems,
      executionRecords: [],
    });
  }, [plans, todayBogotaISO]);

  const handleExecutionSuccess = (result: FieldReportResult) => {
    if (refetch) {
      refetch();
    }
  };

  const handlePrevWeek = () => {
    const parts = selectedWeekStart.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) - 7);
    setSelectedWeekStart(dt.toISOString().substring(0, 10));
    setSelectedGroupId(null);
  };

  const handleNextWeek = () => {
    const parts = selectedWeekStart.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + 7);
    setSelectedWeekStart(dt.toISOString().substring(0, 10));
    setSelectedGroupId(null);
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* 1. NAVEGADOR DE SEMANA OPERATIVA (Selector Mobile-First) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Semana de Operación
            </p>
            <p className="text-sm sm:text-base font-extrabold text-slate-800">
              {formatDayMonth(week.start)} — {formatDayMonth(week.end)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="min-h-[44px] min-w-[44px] p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold flex items-center justify-center transition-colors active:scale-95 touch-manipulation"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {selectedWeekStart !== defaultMonday && (
            <button
              type="button"
              onClick={() => {
                setSelectedWeekStart(defaultMonday);
                setSelectedGroupId(null);
              }}
              className="min-h-[44px] px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-colors active:scale-95 touch-manipulation"
            >
              Semana Actual
            </button>
          )}

          <button
            type="button"
            onClick={handleNextWeek}
            className="min-h-[44px] min-w-[44px] p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold flex items-center justify-center transition-colors active:scale-95 touch-manipulation"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Daily Briefing Banner (Resumen operativo compacto) */}
      {!isLoading && !isError && plans && plans.length > 0 && (
        <DailyBriefBanner
          brief={dailyBrief}
          onFilterStatus={setStatusFilter}
          activeStatusFilter={statusFilter}
        />
      )}

      {/* 3. Estados de Carga y Error */}
      {isLoading && (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-red-50/50 rounded-2xl border-2 border-dashed border-red-200 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-red-600 font-bold text-base">No se pudo cargar el plan de la semana.</p>
          <p className="text-xs text-red-400 mt-1 max-w-md">
            {error instanceof Error ? error.message : 'Error desconocido de conexión o permisos'}
          </p>
        </div>
      )}

      {!isLoading && !isError && (plans?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <CalendarX2 className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-700 font-bold text-base">No hay plan publicado para esta semana.</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Utiliza las flechas superiores para navegar a semanas anteriores o futuras con planes publicados.
          </p>
        </div>
      )}

      {/* 4. PROYECCIÓN NIVELES UX:
          Nivel 1: Lista de Sitios (SiteListView) cuando selectedGroupId === null
          Nivel 2: Detalle del Sitio (ActividadesView) cuando selectedGroupId !== null
      */}
      {!isLoading && !isError && plans && plans.length > 0 && (
        selectedGroupId === null ? (
          <SiteListView
            plans={plans}
            onSelectSite={(groupId) => setSelectedGroupId(groupId)}
          />
        ) : (
          <ActividadesView
            plans={plans}
            selectedGroupId={selectedGroupId}
            onBackToSites={() => setSelectedGroupId(null)}
            userId={user?.id}
            onExecutionSuccess={handleExecutionSuccess}
          />
        )
      )}
    </div>
  );
}
