'use client';

// Superficie del LÍDER — Nivel 2: Vista del Sitio Seleccionado (/my-work)
// Aislamiento de contexto por sitio. Actividades ordenadas por prioridad de estado:
// 1. 🔴 PENDIENTES  2. 🟠 EN EJECUCIÓN  3. 🟢 COMPLETADAS
// Acción explícita "📷 REGISTRAR EJECUCIÓN" con touch target >= 44px para operarios en campo.

import { useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  Camera,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { ActivityPriority } from '@/types/scheduler';
import ItemExecutions from './ItemExecutions';
import DailyActivityExecutionModal from './DailyActivityExecutionModal';
import { FieldReportResult } from '@/lib/fieldWorkflowExecutionService';
import { SupabaseClient } from '@supabase/supabase-js';

interface Props {
  plans: PublishedWeekPlan[];
  selectedGroupId?: string | null;
  onBackToSites?: () => void;
  userId?: string;
  supabaseClient?: SupabaseClient;
  onExecutionSuccess?: (result: FieldReportResult) => void;
}

const PRIORITY_LABEL: Record<ActivityPriority, { text: string; cls: string }> = {
  must_execute: { text: 'Obligatoria', cls: 'bg-red-50 text-red-600 border-red-200' },
  preferred: { text: 'Preferente', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  flexible: { text: 'Flexible', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDayName(dateIso?: string): string {
  if (!dateIso || dateIso.length < 10) return 'Sin fecha';
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);

  const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  const dayOfWeek = days[date.getDay()] || '';
  const monthStr = months[month] || '';
  return `${dayOfWeek} ${day} ${monthStr}`;
}

export function SingleActivityCard({
  item,
  planId,
  boardId,
  groupId,
  userId,
  supabaseClient,
  onExecutionSuccess,
}: {
  item: PublishedWeekPlanItem;
  planId: string;
  boardId: string;
  groupId: string;
  userId?: string;
  supabaseClient?: SupabaseClient;
  onExecutionSuccess?: (result: FieldReportResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const name = item.standard?.name ?? item.name ?? item.activity_key;
  const category = item.standard?.category ?? item.zone;
  const priority = PRIORITY_LABEL[item.priority] ?? PRIORITY_LABEL.flexible;

  const plannedQty = item.planned_qty || 0;
  const executedQty = item.executed_qty || 0;
  const progress = plannedQty > 0 ? Math.min(100, Math.round((executedQty / plannedQty) * 100)) : 0;

  const status: 'pending' | 'in_progress' | 'completed' =
    executedQty === 0 ? 'pending' : executedQty < plannedQty ? 'in_progress' : 'completed';

  const handleModalSuccess = (result: FieldReportResult) => {
    if (onExecutionSuccess) {
      onExecutionSuccess(result);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all overflow-hidden">
      <div className="p-4 sm:p-5 space-y-3">
        {/* Cabecera de la Actividad: Título + Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words">
              {name}
            </h4>
            {category && (
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                {category}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${priority.cls}`}>
              {priority.text}
            </span>
          </div>
        </div>

        {/* Info Operativa: Fecha Programada & Avance Físico */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Programada: {formatDayName(item.planned_date)}</span>
          </div>

          <div className="text-right">
            <span className="font-bold text-slate-800">{formatNumber(executedQty)}</span> /{' '}
            <span className="font-semibold text-slate-600">{formatNumber(plannedQty)}</span>{' '}
            <span className="text-slate-400">{item.unit}</span>
          </div>
        </div>

        {/* Barra de Progreso Físico */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Avance de obra</span>
            <span className="font-bold text-slate-700">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                status === 'completed' ? 'bg-emerald-500' : status === 'in_progress' ? 'bg-amber-500' : 'bg-[#3B7EF8]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* BOTÓN PRINCIPAL DE ACCIÓN (Touch target >= 44px) */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-slate-100">
          {status === 'pending' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[48px] px-4 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] touch-manipulation"
            >
              <Camera className="w-5 h-5 shrink-0" />
              <span>REGISTRAR EJECUCIÓN</span>
            </button>
          )}

          {status === 'in_progress' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[48px] px-4 py-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] touch-manipulation"
            >
              <Camera className="w-5 h-5 shrink-0" />
              <span>CONTINUAR REGISTRO</span>
            </button>
          )}

          {status === 'completed' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] touch-manipulation"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>VER REGISTRO</span>
            </button>
          )}

          {/* Toggle para ver historial secundario */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="self-center sm:self-auto py-1 px-2 text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1 select-none"
          >
            <span>{expanded ? 'Ocultar historial' : 'Historial'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Historial Plegable de Jornadas Previas */}
      {expanded && (
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <ItemExecutions planId={planId} groupId={groupId} planItemId={item.id} unit={item.unit} />
        </div>
      )}

      {/* Modal de Registro de Ejecución y Evidencia */}
      <DailyActivityExecutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        item={item}
        boardId={boardId}
        groupId={groupId}
        userId={userId}
        supabase={supabaseClient}
      />
    </div>
  );
}

export default function ActividadesView({
  plans,
  selectedGroupId,
  onBackToSites,
  userId,
  supabaseClient,
  onExecutionSuccess,
}: Props) {
  // Filtrar planes al grupo/sitio seleccionado si existe
  const targetPlans = selectedGroupId
    ? plans.filter((p) => p.group_id === selectedGroupId)
    : plans;

  if (targetPlans.length === 0 && selectedGroupId) {
    return (
      <div className="space-y-4">
        {onBackToSites && (
          <button
            type="button"
            onClick={onBackToSites}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Mis sitios</span>
          </button>
        )}
        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
          <p className="text-sm font-semibold text-slate-600">No se encontraron actividades para este sitio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {targetPlans.map((plan) => {
        const siteName = plan.group?.title ?? 'Sitio General';
        const items = plan.items || [];

        // Agrupar actividades por estado estricto:
        // 1. Pendientes  2. En ejecución  3. Completadas
        const pendingItems: PublishedWeekPlanItem[] = [];
        const inProgressItems: PublishedWeekPlanItem[] = [];
        const completedItems: PublishedWeekPlanItem[] = [];

        for (const item of items) {
          const plannedQty = item.planned_qty || 0;
          const executedQty = item.executed_qty || 0;

          if (executedQty === 0) {
            pendingItems.push(item);
          } else if (executedQty < plannedQty) {
            inProgressItems.push(item);
          } else {
            completedItems.push(item);
          }
        }

        return (
          <section key={plan.id} className="space-y-6">
            {/* ENCABEZADO DEL NIVEL 2: Volver + Nombre del Sitio */}
            <header className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {onBackToSites && (
                  <button
                    type="button"
                    onClick={onBackToSites}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 touch-manipulation"
                    aria-label="Volver a lista de sitios"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Mis sitios</span>
                  </button>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>Sitio Seleccionado</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight truncate">
                    {siteName}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70">
                <span>{items.length} actividades totales</span>
              </div>
            </header>

            {/* SECCIÓN 1: 🔴 PENDIENTES (Primero) */}
            {pendingItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span>Pendientes ({pendingItems.length})</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {pendingItems.map((item) => (
                    <SingleActivityCard
                      key={item.id}
                      item={item}
                      planId={plan.id}
                      boardId={plan.board_id}
                      groupId={plan.group_id}
                      userId={userId}
                      supabaseClient={supabaseClient}
                      onExecutionSuccess={onExecutionSuccess}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN 2: 🟠 EN EJECUCIÓN (Segundo) */}
            {inProgressItems.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>En Ejecución ({inProgressItems.length})</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {inProgressItems.map((item) => (
                    <SingleActivityCard
                      key={item.id}
                      item={item}
                      planId={plan.id}
                      boardId={plan.board_id}
                      groupId={plan.group_id}
                      userId={userId}
                      supabaseClient={supabaseClient}
                      onExecutionSuccess={onExecutionSuccess}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN 3: 🟢 COMPLETADAS (Al Final) */}
            {completedItems.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Completadas ({completedItems.length})</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {completedItems.map((item) => (
                    <SingleActivityCard
                      key={item.id}
                      item={item}
                      planId={plan.id}
                      boardId={plan.board_id}
                      groupId={plan.group_id}
                      userId={userId}
                      supabaseClient={supabaseClient}
                      onExecutionSuccess={onExecutionSuccess}
                    />
                  ))}
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-sm font-semibold text-slate-500">Este sitio no tiene actividades en esta semana.</p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
