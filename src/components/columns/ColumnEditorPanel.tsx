'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, EyeOff, Eye, Lock, Type, Hash, Calendar, Users, CheckSquare, Tag, List } from 'lucide-react';
import { Column, ColumnType, LabelOptions } from '@/types/monday';
import { getLabelOptions } from '@/utils/columnUtils';
import { OptionsEditor } from './OptionsEditor';

const TYPE_META: Record<ColumnType, { label: string; icon: React.ReactNode; desc: string }> = {
  status:   { label: 'Estado',          icon: <div className="w-3 h-3 rounded-full bg-[#10B981]" />, desc: 'Selección de estado con colores' },
  priority: { label: 'Prioridad',       icon: <div className="w-3 h-3 rounded-full bg-[#EF4444]" />, desc: 'Niveles de prioridad con colores' },
  text:     { label: 'Texto',           icon: <Type size={12} />,        desc: 'Texto libre de una línea' },
  numbers:  { label: 'Número',          icon: <Hash size={12} />,        desc: 'Valor numérico o monetario' },
  date:     { label: 'Fecha',           icon: <Calendar size={12} />,    desc: 'Selector de fecha' },
  people:   { label: 'Persona',         icon: <Users size={12} />,       desc: 'Asignación de responsable' },
  checkbox: { label: 'Casilla',         icon: <CheckSquare size={12} />, desc: 'Sí / No' },
  tags:     { label: 'Etiquetas',       icon: <Tag size={12} />,         desc: 'Múltiples etiquetas' },
  dropdown: { label: 'Desplegable',     icon: <List size={12} />,        desc: 'Lista de opciones' },
  timeline: { label: 'Línea de tiempo', icon: <Calendar size={12} />,   desc: 'Rango de fechas' },
};

const LABEL_TYPES: ColumnType[] = ['status', 'priority', 'dropdown', 'tags'];

interface ColumnEditorPanelProps {
  column: Column;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ColumnEditorPanel({ column, onUpdate, onDelete, onClose }: ColumnEditorPanelProps) {
  const [title, setTitle] = useState(column.title);
  const [type, setType] = useState<ColumnType>(column.type as ColumnType);
  const [required, setRequired] = useState(!!column.required);
  const [hidden, setHidden] = useState(!!column.hidden);
  const [labelOpts, setLabelOpts] = useState<LabelOptions | undefined>(getLabelOptions(column));
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync if parent passes a different column
  useEffect(() => {
    setTitle(column.title);
    setType(column.type as ColumnType);
    setRequired(!!column.required);
    setHidden(!!column.hidden);
    setLabelOpts(getLabelOptions(column));
    setConfirmDelete(false);
  }, [column.id]);

  const handleSave = () => {
    const updates: Partial<Column> = { title, type, required, hidden };
    if (LABEL_TYPES.includes(type) && labelOpts) {
      updates.options = labelOpts;
    }
    onUpdate(updates);
  };

  const hasLabelEditor = LABEL_TYPES.includes(type);
  const isSystemColumn = !!column.key; // system columns have a reserved key

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
        <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-primary)]">Editar columna</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]/40 text-slate-500 hover:text-[var(--text-primary)] transition-all">
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">

        {/* Title */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Nombre</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full px-3 py-2 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-xl text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[#3B7EF8]/50 focus:ring-0 transition-colors"
            placeholder="Nombre de la columna"
          />
        </div>

        {/* Type picker */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Tipo</label>
          {isSystemColumn ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)]/20 border border-[var(--border-color)] rounded-xl opacity-60">
              <span className="text-slate-400">{TYPE_META[type]?.icon}</span>
              <span className="text-[11px] font-medium text-slate-400">{TYPE_META[type]?.label}</span>
              <Lock size={11} className="ml-auto text-slate-500" />
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowTypeMenu(!showTypeMenu)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] hover:border-[#3B7EF8]/30 rounded-xl text-sm transition-all"
              >
                <span className="text-[var(--text-secondary)]">{TYPE_META[type]?.icon}</span>
                <span className="text-[11px] font-medium text-[var(--text-primary)]">{TYPE_META[type]?.label}</span>
                <svg className="ml-auto w-3 h-3 text-slate-500" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L1 3h10L6 8z"/></svg>
              </button>
              {showTypeMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden">
                  {(Object.keys(TYPE_META) as ColumnType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setType(t); setLabelOpts(getLabelOptions({ ...column, type: t } as Column)); setShowTypeMenu(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#3B7EF8]/10 transition-colors ${type === t ? 'bg-[#3B7EF8]/10 text-[#3B7EF8]' : 'text-[var(--text-primary)]'}`}
                    >
                      <span className={type === t ? 'text-[#3B7EF8]' : 'text-[var(--text-secondary)]'}>{TYPE_META[t].icon}</span>
                      <div>
                        <div className="text-[11px] font-bold">{TYPE_META[t].label}</div>
                        <div className="text-[9px] text-slate-500">{TYPE_META[t].desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Comportamiento</label>

          <button
            onClick={() => setRequired(!required)}
            disabled={isSystemColumn && required}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${required ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/30' : 'border-[var(--border-color)] hover:border-[#3B7EF8]/20'}`}
          >
            <span className="text-[11px] font-medium text-[var(--text-primary)]">Campo requerido</span>
            <div className={`w-8 h-4.5 rounded-full transition-all ${required ? 'bg-[#3B7EF8]' : 'bg-slate-600'} relative`}>
              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${required ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </button>

          <button
            onClick={() => setHidden(!hidden)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${hidden ? 'bg-amber-500/10 border-amber-500/30' : 'border-[var(--border-color)] hover:border-amber-500/20'}`}
          >
            <div className="flex items-center gap-2">
              {hidden ? <EyeOff size={13} className="text-amber-500" /> : <Eye size={13} className="text-slate-400" />}
              <span className="text-[11px] font-medium text-[var(--text-primary)]">{hidden ? 'Oculta' : 'Visible'}</span>
            </div>
            <div className={`w-8 h-4.5 rounded-full transition-all ${hidden ? 'bg-amber-500' : 'bg-slate-600'} relative`}>
              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${hidden ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </button>
        </div>

        {/* Options editor */}
        {hasLabelEditor && (
          <div className="border-t border-[var(--border-color)] pt-4">
            <OptionsEditor
              options={labelOpts ?? { labels: [] }}
              onChange={setLabelOpts}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[var(--border-color)] space-y-2">
        <button
          onClick={handleSave}
          className="w-full py-2.5 bg-[#3B7EF8] hover:bg-[#2563EB] text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
        >
          Guardar cambios
        </button>

        {!isSystemColumn && (
          confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={onDelete} className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Sí, eliminar
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:border-slate-400">
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-rose-500 hover:bg-rose-500/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <Trash2 size={12} /> Eliminar columna
            </button>
          )
        )}
      </div>
    </div>
  );
}
