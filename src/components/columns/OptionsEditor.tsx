'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ColumnLabel, LabelOptions } from '@/types/monday';

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B7EF8',
  '#8B5CF6', '#EC4899', '#14B8A6', '#334155',
  '#64748B', '#F97316', '#84CC16', '#06B6D4',
];

interface OptionsEditorProps {
  options: LabelOptions;
  onChange: (opts: LabelOptions) => void;
}

export function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const labels = options.labels ?? [];
  const [newTitle, setNewTitle] = useState('');

  const update = (updated: ColumnLabel[]) => onChange({ ...options, labels: updated });

  const addLabel = () => {
    if (!newTitle.trim()) return;
    const id = newTitle.trim().replace(/\s+/g, '_');
    const color = PRESET_COLORS[labels.length % PRESET_COLORS.length];
    update([...labels, { id, title: newTitle.trim(), color }]);
    setNewTitle('');
  };

  const removeLabel = (idx: number) => {
    const next = labels.filter((_, i) => i !== idx);
    const wasDefault = labels[idx].id === options.default;
    onChange({ ...options, labels: next, default: wasDefault ? next[0]?.id : options.default });
  };

  const updateLabel = (idx: number, patch: Partial<ColumnLabel>) => {
    update(labels.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const setDefault = (id: string) => onChange({ ...options, default: id });

  const moveLabel = (idx: number, dir: -1 | 1) => {
    const next = [...labels];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    update(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Opciones</p>

      <div className="space-y-1.5">
        {labels.map((label, idx) => (
          <div key={label.id} className="group flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] hover:border-[#3B7EF8]/30 transition-all">
            {/* Order */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveLabel(idx, -1)} disabled={idx === 0} className="text-slate-600 hover:text-[var(--text-primary)] disabled:opacity-20 leading-none">
                <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0L8 5H0L4 0Z"/></svg>
              </button>
              <button onClick={() => moveLabel(idx, 1)} disabled={idx === labels.length - 1} className="text-slate-600 hover:text-[var(--text-primary)] disabled:opacity-20 leading-none">
                <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0H8L4 5Z"/></svg>
              </button>
            </div>

            {/* Color picker */}
            <div className="relative">
              <input
                type="color"
                value={label.color}
                onChange={e => updateLabel(idx, { color: e.target.value })}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              />
              <div className="w-5 h-5 rounded-full border border-white/30 shadow-sm pointer-events-none" style={{ backgroundColor: label.color }} />
            </div>

            {/* Title */}
            <input
              value={label.title}
              onChange={e => updateLabel(idx, { title: e.target.value })}
              className="flex-1 bg-transparent text-[11px] font-medium text-[var(--text-primary)] border-none outline-none focus:ring-0 min-w-0"
            />

            {/* Default radio */}
            <button
              onClick={() => setDefault(label.id)}
              title="Marcar como valor por defecto"
              className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest transition-all ${options.default === label.id ? 'bg-[#3B7EF8] text-white' : 'text-slate-600 hover:text-[#3B7EF8] border border-[var(--border-color)]'}`}
            >
              {options.default === label.id ? 'DEF' : 'def'}
            </button>

            {/* Delete */}
            <button onClick={() => removeLabel(idx)} className="p-1 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Add new label */}
      <div className="flex gap-2 mt-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLabel()}
          placeholder="Nueva opción..."
          className="flex-1 text-[11px] px-2 py-1.5 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-slate-600 outline-none focus:border-[#3B7EF8]/50 focus:ring-0"
        />
        <button
          onClick={addLabel}
          disabled={!newTitle.trim()}
          className="px-3 py-1.5 bg-[#3B7EF8]/10 hover:bg-[#3B7EF8] text-[#3B7EF8] hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-[#3B7EF8]/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Preset colors */}
      <div className="mt-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Paleta rápida</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map(color => (
            <div
              key={color}
              className="w-4 h-4 rounded-full cursor-pointer border-2 border-transparent hover:border-white/50 transition-all"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
