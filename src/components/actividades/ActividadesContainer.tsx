'use client';

// Superficie del LÍDER — Container de Mis Actividades (/my-work)
// Implementa la Jerarquía Progresiva de 3 Niveles (SITIOS -> ACTIVIDADES -> REGISTRO DE EJECUCIÓN -> EVIDENCIA).
// Soporta la Navegación Temporal Today-First y Progressive Disclosure de Resagadas (UX-01).
// Consumo soberano de usePublishedWeekPlans, evaluateDailyOperationalBrief y projectMyWorkTemporalView sin mutaciones.

import { useMemo, useState } from 'react';
import {
  CalendarX2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { usePublishedWeekPlans } from '@/hooks/useWeeklyPlans';
import { useAuth } from '@/contexts/AuthContext';
import { getMonday, getWeekBounds, getBogotaToday } from '@/lib/weeklyPlanner';
import { evaluateDailyOperationalBrief, DailyOperationalBrief } from '@/lib/dailyOperationalBriefService';
import { projectMyWorkTemporalView, formatFriendlyDate } from '@/lib/myWorkTemporalProjection';
import DailyBriefBanner from './DailyBriefBanner';
import SiteListView from './SiteListView';
import ActividadesView from './ActividadesView';
import OverdueActivitiesSection from './OverdueActivitiesSection';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { FieldReportResult } from '@/lib/fieldWorkflowExecutionService';

function formatDayMonth(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const day = parts[2];
  const month = parts[1];
  return `${day}/${month}`;
}

/**
 * Formateador de Fecha Civil Determinista en 'America/Bogota' (ADR-0007 / H6.4).
 * Convierte cualquier fecha a formato YYYY-MM-DD respetando la zona horaria de Bogotá (UTC-5).
 */
export function getBogotaCivilDateISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Deriva el Lunes de la semana ISO en formato YYYY-MM-DD sin desbordamiento ni desfase UTC.
 */
export function getMondayCivilISO(isoDateString: string): string {
  const parts = isoDateString.split('-').map(Number);
  if (parts.length !== 3) return isoDateString;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  const yStr = date.getUTCFullYear();
  const mStr = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dStr = String(date.getUTCDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

export default function ActividadesContainer() {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [viewMode, setViewMode] = useState<'today' | 'allWeek'>('today');

  // Control de Semana Activa (H6.4: Fecha Civil Determinista en Bogotá YYYY-MM-DD)
  const todayBogotaISO = useMemo(() => getBogotaCivilDateISO(), []);
  const defaultMonday = useMemo(() => getMondayCivilISO(todayBogotaISO), [todayBogotaISO]);

  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(defaultMonday);

  const week = useMemo(() => {
    const parts = selectedWeekStart.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const monday = new Date(year, month, day);
    return getWeekBounds(monday);
  }, [selectedWeekStart]);

  const { data: plans, isLoading, isError, error, refetch } = usePublishedWeekPlans(week.start);

  // Proyección temporal única UX-01 (Today / Overdue / Future / Historical)
  const temporalData = useMemo(() => {
    return projectMyWorkTemporalView(plans, todayBogotaISO);
  }, [plans, todayBogotaISO]);

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

  const friendlyToday = useMemo(() => formatFriendlyDate(todayBogotaISO), [todayBogotaISO]);

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* 1. NAVEGADOR Y CABECERA TEMPORAL TODAY-FIRST */}
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-2xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Jornada de Campo
            </p>
          </div>
          <h1 className="text-xl sm:text-2xl font-brand font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-2 flex-wrap">
            <span>Hoy · {friendlyToday}</span>
          </h1>
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Semana activa: {formatDayMonth(week.start)} al {formatDayMonth(week.end)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
          {/* Selector de Modo Temporal (Hoy vs Semana Completa) */}
          <div className="bg-[var(--color-surface-subtle)] p-1 rounded-[var(--radius-control)] flex items-center gap-1 border border-[var(--border-color)]" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'today'}
              onClick={() => setViewMode('today')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-1.5 transition-all touch-manipulation ${
                viewMode === 'today'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Hoy ({temporalData.counts.todayTotal})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'allWeek'}
              onClick={() => setViewMode('allWeek')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-1.5 transition-all touch-manipulation ${
                viewMode === 'allWeek'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>Semana ({temporalData.counts.allWeekTotal})</span>
            </button>
          </div>

          {/* Navegación entre semanas */}
          <div className="flex items-center gap-1 bg-[var(--color-surface-subtle)] p-1 rounded-[var(--radius-control)] border border-[var(--border-color)]">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="min-h-[38px] min-w-[38px] p-2 hover:bg-[var(--card-bg)] rounded-[var(--radius-control)] text-[var(--text-secondary)] font-bold flex items-center justify-center transition-colors active:scale-95 touch-manipulation"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {selectedWeekStart !== defaultMonday && (
              <button
                type="button"
                onClick={() => {
                  setSelectedWeekStart(defaultMonday);
                  setSelectedGroupId(null);
                }}
                className="min-h-[38px] px-2.5 py-1 text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] rounded-[var(--radius-control)] text-xs font-bold transition-colors active:scale-95 touch-manipulation"
              >
                Actual
              </button>
            )}

            <button
              type="button"
              onClick={handleNextWeek}
              className="min-h-[38px] min-w-[38px] p-2 hover:bg-[var(--card-bg)] rounded-[var(--radius-control)] text-[var(--text-secondary)] font-bold flex items-center justify-center transition-colors active:scale-95 touch-manipulation"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Daily Briefing Banner (Resumen operativo) */}
      {!isLoading && !isError && plans && plans.length > 0 && (
        <DailyBriefBanner
          brief={dailyBrief}
          onFilterStatus={setStatusFilter}
          activeStatusFilter={statusFilter}
        />
      )}

      {/* 3. SECCIÓN DE RESAGADAS (UX-01-B: Alerta con Progressive Disclosure) */}
      {!isLoading && !isError && plans && plans.length > 0 && temporalData.counts.overdueTotal > 0 && (
        <OverdueActivitiesSection
          overdueGroups={temporalData.overdueGroups}
          totalOverdueCount={temporalData.counts.overdueTotal}
          plans={plans}
          userId={user?.id}
          onExecutionSuccess={handleExecutionSuccess}
          onSelectSite={(groupId) => setSelectedGroupId(groupId)}
        />
      )}

      {/* 4. Estados de Carga y Error */}
      {isLoading && (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-red-500/10 rounded-[var(--radius-surface)] border-2 border-dashed border-red-500/30 text-center">
          <AlertTriangle className="w-8 h-8 text-[var(--color-danger)] mb-3" />
          <p className="text-[var(--color-danger)] font-bold text-base">No se pudo cargar el plan de la semana.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md">
            {error instanceof Error ? error.message : 'Error desconocido de conexión o permisos'}
          </p>
        </div>
      )}

      {/* 5. Estado Vacío General: Sin planes publicados en la semana */}
      {!isLoading && !isError && (plans?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-[var(--color-surface-subtle)] rounded-[var(--radius-surface)] border-2 border-dashed border-[var(--border-color)] text-center">
          <CalendarX2 className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-primary)] font-bold text-base">No hay plan publicado para esta semana.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md">
            Utiliza las flechas superiores para navegar a semanas anteriores o futuras con planes publicados.
          </p>
        </div>
      )}

      {/* 6. ESTADO VACÍO CONTEXTUAL (UX-01-D: Hoy sin actividades, pero con o sin resagadas) */}
      {!isLoading && !isError && plans && plans.length > 0 && viewMode === 'today' && temporalData.counts.todayTotal === 0 && (
        <div className="p-8 sm:p-10 bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-2xs text-center space-y-3 transition-colors">
          <div className="w-12 h-12 rounded-[var(--radius-surface)] bg-emerald-500/10 text-[var(--color-success)] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-brand font-bold text-[var(--text-primary)]">
              No tienes actividades programadas para hoy
            </h3>
            {temporalData.counts.overdueTotal > 0 ? (
              <p className="text-xs text-[var(--color-warning)] font-semibold max-w-md mx-auto">
                Tienes {temporalData.counts.overdueTotal} actividad{temporalData.counts.overdueTotal > 1 ? 'es' : ''} resagada{temporalData.counts.overdueTotal > 1 ? 's' : ''} de días anteriores en la sección superior que requiere{temporalData.counts.overdueTotal > 1 ? 'n' : ''} gestión.
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] font-medium max-w-md mx-auto">
                Todo al día en tu programación para la jornada de hoy.
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setViewMode('allWeek')}
              className="px-4 py-2 bg-[var(--color-surface-subtle)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-[var(--radius-control)] text-xs font-bold transition-colors"
            >
              Ver programación de toda la semana ({temporalData.counts.allWeekTotal})
            </button>
          </div>
        </div>
      )}

      {/* 7. PROYECCIÓN NIVELES UX:
          Nivel 1: Lista de Sitios (SiteListView) cuando selectedGroupId === null
          Nivel 2: Detalle del Sitio (ActividadesView) cuando selectedGroupId !== null
      */}
      {!isLoading && !isError && plans && plans.length > 0 && (viewMode === 'allWeek' || temporalData.counts.todayTotal > 0) && (
        selectedGroupId === null ? (
          <SiteListView
            plans={plans}
            onSelectSite={(groupId) => setSelectedGroupId(groupId)}
            operationalTodayISO={todayBogotaISO}
            showAllWeek={viewMode === 'allWeek'}
          />
        ) : (
          <ActividadesView
            plans={plans}
            selectedGroupId={selectedGroupId}
            onBackToSites={() => setSelectedGroupId(null)}
            userId={user?.id}
            onExecutionSuccess={handleExecutionSuccess}
            operationalTodayISO={todayBogotaISO}
            showAllWeek={viewMode === 'allWeek'}
          />
        )
      )}
    </div>
  );
}
