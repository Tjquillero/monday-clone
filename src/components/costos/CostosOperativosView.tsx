'use client';

import { AlertTriangle, DollarSign } from 'lucide-react';
import { WeeklyPlanningContext } from '@/types/scheduler';
import { WORKING_DAYS_MONTH } from '@/lib/schedulerMath';

// Dashboard de Costos Operativos (Fase 1 / MVP) — hace visible lo que el
// Scheduler ya calcula correctamente (ADR-0009), sin ninguna fórmula propia.
// `plan.activities` viene tal cual de useWeeklyPlan (el mismo hook que usa
// el Cronograma) — este componente solo multiplica JR/mes × costoJornal y
// suma. No reinterpreta cantidades, frecuencias ni rendimientos.

interface Props {
  boardId: string | undefined;
  group: { id: string; title: string } | undefined;
  plan: WeeklyPlanningContext | null;
  costoJornal: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export default function CostosOperativosView({ group, plan, costoJornal, isLoading, isError, error }: Props) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Calculando costos...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-red-500/30 bg-red-500/10">
          <p className="text-xs text-red-400">{error?.message ?? 'No se pudo calcular el costo operativo.'}</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6">
        <p className="text-xs text-slate-500">Selecciona un sitio para ver sus costos operativos.</p>
      </div>
    );
  }

  const activities = plan?.activities ?? [];
  const totalJornales = activities.reduce((s, a) => s + a.theoretical_journals_month, 0);
  const totalCosto = totalJornales * costoJornal;
  const capacidadDisponible = (plan?.zone.daily_capacity ?? 0) * WORKING_DAYS_MONTH;
  const utilizacion = capacidadDisponible > 0 ? Math.round((totalJornales / capacidadDisponible) * 100) : 0;
  const deficit = Math.max(0, totalJornales - capacidadDisponible);
  // costoJornal=0 es indistinguible de "no configurado" (nadie factura
  // gratis) — se trata explícitamente como dato faltante, nunca como un
  // costo real de $0, para no comunicar "esta operación no cuesta nada".
  const wageMissing = costoJornal <= 0;

  const sorted = [...activities].sort(
    (a, b) => (b.theoretical_journals_month * costoJornal) - (a.theoretical_journals_month * costoJornal),
  );

  return (
    <div className="h-full overflow-auto custom-scrollbar p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#3B7EF8]" /> Costos Operativos
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">
          {group.title} — mano de obra teórica del Cronograma
        </p>
      </div>

      {wageMissing && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">
            <span className="font-black">Costo no disponible</span> — falta configurar el costo del jornal
            para esta zona en Recursos y Eficiencia. Los jornales sí están calculados; el costo en dinero no
            se puede mostrar todavía.
          </p>
        </div>
      )}

      {/* ── Resumen superior ────────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Metric label="JR mensuales" value={totalJornales.toFixed(1)} />
          <Metric label="Costo mensual" value={wageMissing ? 'Pendiente' : formatCurrency(totalCosto)} pending={wageMissing} />
          <Metric label="Costo / jornal" value={wageMissing ? 'Pendiente' : formatCurrency(costoJornal)} pending={wageMissing} />
          <Metric label="Capacidad disponible" value={`${capacidadDisponible.toFixed(0)} JR`} />
          <Metric label="Utilización" value={`${utilizacion}%`} danger={utilizacion > 100} />
          <Metric label="Déficit" value={`${deficit.toFixed(1)} JR`} danger={deficit > 0} />
        </div>
      </div>

      {/* ── Tabla principal ─────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500 uppercase tracking-widest">
          Sin actividades planificadas para este sitio esta semana.
        </p>
      ) : (
        <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-[var(--border-color)]">
                <th className="p-3">Código</th>
                <th className="p-3">Actividad</th>
                <th className="p-3">Cantidad</th>
                <th className="p-3">Rendimiento</th>
                <th className="p-3">JR/mes</th>
                <th className="p-3">Costo mensual</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.activity_key} className="border-b border-[var(--border-color)] last:border-0">
                  <td className="p-3 font-mono text-slate-300">{a.activity_key}</td>
                  <td className="p-3 text-slate-300">{a.name}</td>
                  <td className="p-3 text-slate-400">{a.qty.toLocaleString('es-CO')} {a.unit}</td>
                  <td className="p-3 text-slate-400">{a.rendimiento.toLocaleString('es-CO')}</td>
                  <td className="p-3 text-slate-300">{a.theoretical_journals_month.toFixed(2)}</td>
                  <td className="p-3 text-white font-bold">
                    {wageMissing ? <span className="text-amber-400 font-normal">Pendiente</span> : formatCurrency(a.theoretical_journals_month * costoJornal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, danger = false, pending = false }: { label: string; value: string; danger?: boolean; pending?: boolean }) {
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black mt-0.5 ${pending ? 'text-amber-400' : danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}
