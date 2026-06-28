'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { ColumnType } from '@/types/monday';

const COLUMN_TYPES: { type: ColumnType; label: string; desc: string; color: string }[] = [
  { type: 'status',   label: 'Estado',      desc: 'Estado con colores personalizables',    color: '#10B981' },
  { type: 'priority', label: 'Prioridad',   desc: 'Niveles de prioridad',                  color: '#EF4444' },
  { type: 'text',     label: 'Texto',        desc: 'Campo de texto libre',                  color: '#6B7280' },
  { type: 'numbers',  label: 'Número',       desc: 'Valor numérico o monetario',            color: '#3B7EF8' },
  { type: 'date',     label: 'Fecha',        desc: 'Selector de fecha',                     color: '#8B5CF6' },
  { type: 'people',   label: 'Persona',      desc: 'Asignación de responsable',             color: '#F59E0B' },
  { type: 'checkbox', label: 'Casilla',      desc: 'Campo Sí / No',                         color: '#14B8A6' },
  { type: 'dropdown', label: 'Desplegable',  desc: 'Lista de opciones',                     color: '#EC4899' },
  { type: 'tags',     label: 'Etiquetas',    desc: 'Múltiples etiquetas configurables',     color: '#F97316' },
  { type: 'timeline', label: 'Línea tiempo', desc: 'Rango de fechas para planificación',    color: '#06B6D4' },
];

interface AddColumnButtonProps {
  onAdd: (type: ColumnType) => void;
  disabled?: boolean;
}

export function AddColumnButton({ onAdd, disabled }: AddColumnButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (type: ColumnType) => {
    onAdd(type);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 h-10 text-[10px] font-black uppercase tracking-widest transition-all border-r border-[var(--border-color)] whitespace-nowrap ${disabled ? 'opacity-40 cursor-not-allowed text-slate-600' : open ? 'text-[#3B7EF8] bg-[#3B7EF8]/10' : 'text-slate-500 hover:text-[#3B7EF8] hover:bg-[#3B7EF8]/5'}`}
        title="Añadir columna"
      >
        {open ? <X size={13} /> : <Plus size={13} />}
        {!open && <span>Columna</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[var(--border-color)]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Añadir columna</p>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto custom-scrollbar">
            {COLUMN_TYPES.map(({ type, label, desc, color }) => (
              <button
                key={type}
                onClick={() => pick(type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#3B7EF8]/5 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}22` }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-[var(--text-primary)]">{label}</div>
                  <div className="text-[9px] text-slate-500">{desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
