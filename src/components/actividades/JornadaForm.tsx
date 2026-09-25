'use client';

// Formulario de jornada del LÍDER — crear o editar un borrador.
// Los jornales (executed_jr) los calcula la base de datos (columna generada
// a partir de trabajadores × duración); la UI no reproduce la fórmula.

import { useState, FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { JornadaFormValues, validateJornada } from './jornadaUtils';

export type { JornadaFormValues };

interface Props {
  unit: string;
  initial?: Partial<JornadaFormValues>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: JornadaFormValues) => void;
  onCancel: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const inputCls =
  'w-full min-h-[44px] sm:min-h-[38px] px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-[var(--border-color)] rounded-[var(--radius-control)] bg-[var(--card-bg)] text-[var(--text-primary)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all';
const labelCls = 'block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1';

export default function JornadaForm({ unit, initial, submitting, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<JornadaFormValues>({
    execution_date: initial?.execution_date ?? todayISO(),
    crew_name: initial?.crew_name ?? '',
    worker_count: initial?.worker_count ?? 1,
    start_time: initial?.start_time ?? '07:00',
    end_time: initial?.end_time ?? '15:00',
    executed_qty: initial?.executed_qty ?? 0,
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof JornadaFormValues>(key: K, value: JornadaFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateJornada(values);
    if (validationError) return setError(validationError);
    setError(null);
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[var(--color-surface-subtle)] border border-[var(--border-color)] rounded-[var(--radius-surface)] p-4 sm:p-5 space-y-4 shadow-xs text-[var(--text-primary)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
        <div>
          <label className={labelCls}>Fecha</label>
          <input
            type="date"
            value={values.execution_date}
            onChange={(e) => set('execution_date', e.target.value)}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Cuadrilla</label>
          <input
            type="text"
            value={values.crew_name}
            onChange={(e) => set('crew_name', e.target.value)}
            placeholder="Nombre de la cuadrilla"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Trabajadores</label>
          <input
            type="number"
            min={1}
            step={1}
            value={values.worker_count}
            onChange={(e) => set('worker_count', Number(e.target.value))}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Hora inicio</label>
          <input
            type="time"
            value={values.start_time}
            onChange={(e) => set('start_time', e.target.value)}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Hora fin</label>
          <input
            type="time"
            value={values.end_time}
            onChange={(e) => set('end_time', e.target.value)}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Cantidad ejecutada ({unit})</label>
          <input
            type="number"
            min={0}
            step="any"
            value={values.executed_qty}
            onChange={(e) => set('executed_qty', Number(e.target.value))}
            className={inputCls}
            required
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notas (opcional)</label>
        <input
          type="text"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Observaciones de la jornada"
          className={inputCls}
        />
      </div>

      <p className="text-[11px] font-medium text-[var(--text-muted)]">
        Jornales: se calcularán automáticamente al guardar.
      </p>

      {error && <p className="text-xs font-semibold text-[var(--color-danger)] bg-[var(--color-danger-subtle)] p-2 rounded-[var(--radius-control)] border border-[var(--color-danger)]/30">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-[48px] sm:min-h-[38px] px-5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-color)] sm:border-0 rounded-[var(--radius-control)]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[48px] sm:min-h-[38px] flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 rounded-[var(--radius-control)] transition-colors disabled:opacity-60 shadow-xs active:scale-[0.99]"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
