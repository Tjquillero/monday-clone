'use client';

import Link from 'next/link';
import {
  ClipboardCheck, AlertTriangle, Camera, CheckCircle2, Lock,
  ArrowRight, ShieldCheck, DollarSign, Circle,
} from 'lucide-react';
import { BoardOperationalAgenda, AgendaSemaphoreColor } from '@/types/scheduler';

// Vista pura de la Agenda Operativa (ADR-0006, Fase 1 — vista Hoy).
// Cuatro bloques, calcados del boceto congelado en
// docs/architecture/agenda-operativa-design.md: Hoy / Semáforo / Acciones /
// Incidencias — cada uno trazable 1:1 a una columna de
// get_board_operational_agenda. Estrictamente de solo lectura: todo lo que
// hace un botón aquí es navegar, nunca mutar.

interface Props {
  boardId: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  agenda: BoardOperationalAgenda | undefined;
}

const SEMAPHORE_STYLE: Record<AgendaSemaphoreColor, string> = {
  green: 'text-[#10B981] fill-[#10B981]',
  amber: 'text-amber-400 fill-amber-400',
  red:   'text-red-400 fill-red-400',
};

export default function AgendaOperativaView({ boardId, isLoading, isError, error, agenda }: Props) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Calculando agenda del día...</p>
        </div>
      </div>
    );
  }

  if (isError || !agenda) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error?.message ?? 'No se pudo cargar la agenda operativa.'}</p>
        </div>
      </div>
    );
  }

  const cronogramaHref = (groupId: string) => `/dashboard?boardId=${boardId}&view=planner&groupId=${groupId}`;
  const hasIncidencias =
    agenda.missing_evidence_count > 0 || agenda.ready_to_confirm.length > 0 || agenda.ready_to_close.length > 0;

  return (
    <div className="h-full overflow-auto custom-scrollbar p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-white">Agenda Operativa</h2>
        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">Hoy — beta, vista Semana en preparación</p>
      </div>

      {/* ── Bloque Hoy ──────────────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Hoy</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<ClipboardCheck className="w-3.5 h-3.5 text-[#3B7EF8]" />} label="Reportadas hoy" value={agenda.reported_today_count} />
          <StatCard icon={<CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />} label="Verificadas hoy" value={agenda.verified_today_count} tone={agenda.verified_today_count > 0 ? 'ok' : 'neutral'} />
          <StatCard icon={<ShieldCheck className="w-3.5 h-3.5 text-amber-400" />} label="Pendientes de verificar" value={agenda.pending_verification_count} tone={agenda.pending_verification_count > 0 ? 'warn' : 'neutral'} />
          <StatCard icon={<Camera className="w-3.5 h-3.5 text-red-400" />} label="Sin evidencia" value={agenda.missing_evidence_count} tone={agenda.missing_evidence_count > 0 ? 'danger' : 'neutral'} />
          <StatCard icon={<Lock className="w-3.5 h-3.5 text-[#3B7EF8]" />} label="Listos (confirmar/cerrar)" value={agenda.ready_to_confirm.length + agenda.ready_to_close.length} tone={agenda.ready_to_confirm.length + agenda.ready_to_close.length > 0 ? 'ok' : 'neutral'} />
        </div>
      </div>

      {/* ── Bloque Semáforo ─────────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Semáforo — semana vigente</p>
        {agenda.site_semaphore.length === 0 ? (
          <p className="text-xs text-slate-500">Ningún sitio tiene un plan activo esta semana.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {agenda.site_semaphore.map((s) => (
              <Link
                key={s.plan_id}
                href={cronogramaHref(s.group_id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:border-[#3B7EF8]/40 bg-black/10 transition-all"
              >
                <Circle className={`w-2.5 h-2.5 ${SEMAPHORE_STYLE[s.semaphore]}`} />
                <span className="text-[10px] font-bold text-white uppercase tracking-tight">{s.group_title}</span>
                <span className="text-[9px] font-mono text-slate-500">{s.pct_verified}%</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Bloque Acciones ─────────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Acciones</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/verification"
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Revisar pendientes <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            href={`/dashboard?boardId=${boardId}&view=financial`}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-[#3B7EF8]/40 text-[#3B7EF8] hover:bg-[#3B7EF8]/10 transition-colors"
          >
            <DollarSign className="w-3 h-3" /> Ir a Costos
          </Link>
        </div>
      </div>

      {/* ── Bloque Incidencias ──────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Incidencias</p>
        {!hasIncidencias ? (
          <p className="text-xs text-[#10B981] flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Sin incidencias abiertas.
          </p>
        ) : (
          <ul className="space-y-2">
            {agenda.missing_evidence_count > 0 && (
              <li className="text-xs text-slate-300 flex items-center gap-2">
                <span className="text-red-400">•</span>
                {agenda.missing_evidence_count} jornada(s) sin evidencia fotográfica
              </li>
            )}
            {agenda.ready_to_confirm.map((p) => (
              <li key={p.plan_id} className="text-xs flex items-center gap-2">
                <span className="text-[#10B981]">•</span>
                <span className="text-slate-300">Plan de <span className="font-semibold text-white">{p.group_title}</span> listo para confirmar</span>
                <Link href={cronogramaHref(p.group_id)} className="text-[#3B7EF8] hover:underline flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ml-1">
                  Ir a Cronograma <ArrowRight className="w-3 h-3" />
                </Link>
              </li>
            ))}
            {agenda.ready_to_close.map((p) => (
              <li key={p.plan_id} className="text-xs flex items-center gap-2">
                <span className="text-[#3B7EF8]">•</span>
                <span className="text-slate-300">Plan de <span className="font-semibold text-white">{p.group_title}</span> listo para cerrar</span>
                <Link href={cronogramaHref(p.group_id)} className="text-[#3B7EF8] hover:underline flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ml-1">
                  Ir a Cronograma <ArrowRight className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone = 'neutral' }: {
  icon: React.ReactNode; label: string; value: number; tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
  const valueColor = tone === 'warn' ? 'text-amber-400' : tone === 'danger' ? 'text-red-400' : tone === 'ok' ? 'text-[#10B981]' : 'text-white';
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">{icon}</div>
      <p className={`text-lg font-black ${valueColor}`}>{value}</p>
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
