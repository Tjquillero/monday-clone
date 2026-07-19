'use client';

import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ArrowRight, Wrench } from 'lucide-react';
import { PlanStatus, MissingEvidenceError, MissingTechnicalConfigError, MissingActivityStandard } from '@/types/scheduler';
import { useWeeklyPlanConfirmationSummary } from '@/hooks/useWeeklyPlans';

// Panel de Confirmación / Cierre / Cerrado — continuación del ciclo de vida
// del plan que ya vive en WeeklyPlannerView (badge de estado + Guardar/
// Publicar). Contrato congelado antes de escribir este componente: ver la
// sección "Contrato congelado de la pantalla Confirmación" del plan de este
// incremento.
//
// No valida ni transiciona nada — confirm_weekly_plan()/close_weekly_plan()
// siguen siendo la única fuente de verdad. Este panel solo decide si MOSTRAR
// el botón habilitado (a partir de un resumen de solo lectura) y traduce los
// errores del servidor a mensajes de negocio, nunca el texto crudo de
// Postgres salvo que el propio RPC ya lo redacte en español.

interface Props {
  planId: string;
  status: PlanStatus;
  periodNumber: number;
  /** Actividades contratadas sin catálogo técnico — ya obtenidas por useWeeklyPlan, se reutilizan aquí (nunca se vuelve a consultar). */
  missingStandards: MissingActivityStandard[];
  onConfirm: () => void;
  isConfirming: boolean;
  confirmError: Error | null;
  onClose: () => void;
  isClosing: boolean;
  closeError: Error | null;
  onGoToCosts: () => void;
}

export default function PlanLifecyclePanel({
  planId, status, periodNumber, missingStandards,
  onConfirm, isConfirming, confirmError,
  onClose, isClosing, closeError,
  onGoToCosts,
}: Props) {
  if (status === 'published' || status === 'in_progress') {
    return (
      <ConfirmationPanel
        planId={planId}
        periodNumber={periodNumber}
        missingStandards={missingStandards}
        onConfirm={onConfirm}
        isConfirming={isConfirming}
        confirmError={confirmError}
      />
    );
  }

  if (status === 'confirmed') {
    return <ClosurePanel onClose={onClose} isClosing={isClosing} closeError={closeError} />;
  }

  if (status === 'closed') {
    return <ClosedPanel onGoToCosts={onGoToCosts} />;
  }

  return null;
}

// ── Confirmación ────────────────────────────────────────────────────────────

function ConfirmationPanel({
  planId, periodNumber, missingStandards, onConfirm, isConfirming, confirmError,
}: {
  planId: string;
  periodNumber: number;
  missingStandards: MissingActivityStandard[];
  onConfirm: () => void;
  isConfirming: boolean;
  confirmError: Error | null;
}) {
  const { data: summary, isLoading, refetch, isFetching } = useWeeklyPlanConfirmationSummary(planId);

  const missingTechConfig = confirmError instanceof MissingTechnicalConfigError ? confirmError : null;
  const missingEvidence = confirmError instanceof MissingEvidenceError ? confirmError : null;
  const otherError = confirmError && !missingTechConfig && !missingEvidence ? confirmError : null;

  const hasMissingStandards = missingStandards.length > 0;
  const pendingCount = summary?.pending_count ?? 0;
  const canConfirm = !isLoading && pendingCount === 0 && !hasMissingStandards;

  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Cronograma semanal #{periodNumber}
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {isLoading ? (
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Calculando estado de las jornadas…</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatMetric icon={<CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />} label="Verificadas" value={summary.verified_count} tone="ok" />
            <StatMetric icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />} label="Pendientes" value={summary.pending_count} tone={summary.pending_count > 0 ? 'warn' : 'neutral'} />
            <StatMetric icon={<XCircle className="w-3.5 h-3.5 text-red-400" />} label="Rechazadas" value={summary.rejected_count} tone="neutral" />
          </div>

          {pendingCount > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-black text-white">No es posible confirmar el plan.</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Faltan por verificar:</p>
              <ul className="space-y-1">
                {summary.pending_executions.map((exec, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="text-slate-600">•</span>
                    {exec.activity_name} — {exec.execution_date}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs font-black text-[#10B981] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Todas las jornadas verificadas
            </p>
          )}
        </>
      ) : null}

      {/* Proactivo: usa missingStandards ya obtenido por useWeeklyPlan (nunca
          se vuelve a consultar) — se muestra ANTES de intentar confirmar, no
          solo como reacción al error del RPC. Si por alguna razón el RPC
          rechazó con MTCFG sin que esta prop lo reflejara (dato stale), se
          usa como respaldo. */}
      {(hasMissingStandards || missingTechConfig) && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 space-y-1.5">
          <p className="text-xs font-black text-red-400 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" /> No se puede confirmar: faltan actividades por configurar en el Catálogo Técnico
          </p>
          <ul className="space-y-1">
            {(hasMissingStandards ? missingStandards : missingTechConfig?.activities ?? []).map((a) => (
              <li key={a.activity_key} className="text-xs text-red-200/90">
                • <span className="font-black">{a.activity_key}</span> — {a.description} ({a.unit})
              </li>
            ))}
          </ul>
        </div>
      )}
      {missingEvidence && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-1.5">
          <p className="text-xs font-black text-amber-400">Faltan evidencias fotográficas en estas jornadas:</p>
          <ul className="space-y-1">
            {missingEvidence.executions.map((exec) => (
              <li key={exec.execution_id} className="text-xs text-amber-200/90">
                • {exec.activity_name} — {exec.execution_date}
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherError && (
        <p className="text-xs text-red-400">{otherError.message}</p>
      )}

      <button
        onClick={onConfirm}
        disabled={!canConfirm || isConfirming}
        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg bg-[#10B981] text-white hover:bg-[#0EA271] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isConfirming ? 'Confirmando…' : 'Confirmar plan'}
      </button>
    </div>
  );
}

function StatMetric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'ok' | 'warn' | 'neutral' }) {
  const valueColor = tone === 'warn' && value > 0 ? 'text-amber-400' : 'text-white';
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">{icon}</div>
      <p className={`text-sm font-black ${valueColor}`}>{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Cierre ───────────────────────────────────────────────────────────────────

function ClosurePanel({ onClose, isClosing, closeError }: { onClose: () => void; isClosing: boolean; closeError: Error | null }) {
  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
      <p className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border text-green-400 border-green-500/40 inline-block">
        Estado: Confirmado
      </p>

      <div>
        <p className="text-xs font-black text-white">Observaciones de cierre</p>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          Al cerrar, se registran observaciones de desempeño para el siguiente ciclo de planificación.
        </p>
      </div>

      {closeError && <p className="text-xs text-red-400">{closeError.message}</p>}

      <button
        onClick={onClose}
        disabled={isClosing}
        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isClosing ? 'Cerrando…' : 'Cerrar plan'}
      </button>
    </div>
  );
}

// ── Cerrado ──────────────────────────────────────────────────────────────────

function ClosedPanel({ onGoToCosts }: { onGoToCosts: () => void }) {
  return (
    <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
      <p className="text-xs font-black text-[#10B981] flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" /> Plan cerrado correctamente
      </p>
      <p className="text-[11px] text-slate-400">El plan ya puede incluirse en un Acta.</p>
      <button
        onClick={onGoToCosts}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border border-[#3B7EF8]/50 text-[#3B7EF8] hover:bg-[#3B7EF8]/10 transition-colors"
      >
        Ir a Costos <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
