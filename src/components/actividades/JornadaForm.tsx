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
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1';

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
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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

      <p className="text-[11px] text-slate-400">
        Jornales: se calcularán automáticamente al guardar.
      </p>

      {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
