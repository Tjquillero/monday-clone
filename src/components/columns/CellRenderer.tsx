'use client';

import { useState, useRef, useEffect } from 'react';
import { Column, Item, ColumnType } from '@/types/monday';
import { getColumnValueKey, getColumnLabelColor, getColumnLabelTitle, getNextLabelId, getDefaultLabelId, getLabelOptions } from '@/utils/columnUtils';

interface CellProps {
  column: Column;
  value: string | number | null | undefined;
  item: Item;
  onUpdate: (value: string | number | null) => void;
}

// ─── Status cell ──────────────────────────────────────────────────────────────

function StatusCell({ column, value, onUpdate }: CellProps) {
  const curr = String(value ?? getDefaultLabelId(column));
  const color = getColumnLabelColor(column, curr);
  const title = getColumnLabelTitle(column, curr);
  const isInProgress = curr === 'Working on it';

  return (
    <button
      onClick={() => onUpdate(getNextLabelId(column, curr))}
      className={`group/status relative overflow-hidden w-full h-[32px] mx-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 text-white shadow-sm ${isInProgress ? 'animate-pulse-orange shadow-[0_0_15px_rgba(245,158,11,0.4)]' : ''}`}
      style={{ backgroundColor: color }}
      title={title}
    >
      <span className="relative z-10">{title}</span>
      {isInProgress && <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/20 animate-progress-indeterminate" />}
    </button>
  );
}

// ─── Priority cell ────────────────────────────────────────────────────────────

function PriorityCell({ column, value, onUpdate }: CellProps) {
  const curr = String(value ?? getDefaultLabelId(column));
  const color = getColumnLabelColor(column, curr);
  const title = getColumnLabelTitle(column, curr);

  return (
    <button
      onClick={() => onUpdate(getNextLabelId(column, curr))}
      className="w-full h-[28px] mx-4 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 flex items-center justify-center gap-2 border border-[var(--border-color)] text-white"
      style={{ backgroundColor: color }}
      title={title}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-white/60 shadow" />
      {title}
    </button>
  );
}

// ─── Text cell ────────────────────────────────────────────────────────────────

function TextCell({ value, onUpdate }: CellProps) {
  const [local, setLocal] = useState(String(value ?? ''));
  const saved = useRef(local);

  useEffect(() => {
    setLocal(String(value ?? ''));
    saved.current = String(value ?? '');
  }, [value]);

  const handleBlur = () => {
    if (local !== saved.current) { onUpdate(local); saved.current = local; }
  };

  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full text-center bg-transparent text-[11px] font-medium text-slate-400 focus:text-[#3B7EF8] border-none outline-none focus:ring-0"
    />
  );
}

// ─── Number cell ──────────────────────────────────────────────────────────────

function NumberCell({ value, onUpdate }: CellProps) {
  const [local, setLocal] = useState(String(value ?? ''));
  const saved = useRef(local);

  useEffect(() => {
    setLocal(String(value ?? ''));
    saved.current = String(value ?? '');
  }, [value]);

  const handleBlur = () => {
    if (local !== saved.current) {
      const n = parseFloat(local);
      onUpdate(isNaN(n) ? null : n);
      saved.current = local;
    }
  };

  return (
    <input
      type="number"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full font-mono font-bold text-center bg-transparent text-xs text-[var(--text-primary)] focus:text-[#3B7EF8] border-none outline-none focus:ring-0"
    />
  );
}

// ─── Checkbox cell ────────────────────────────────────────────────────────────

function CheckboxCell({ value, onUpdate }: CellProps) {
  const checked = Boolean(value);
  return (
    <div className="flex items-center justify-center w-full h-full">
      <button
        onClick={() => onUpdate(checked ? null : 'true')}
        className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${checked ? 'bg-[#3B7EF8] border-[#3B7EF8]' : 'border-[var(--border-color)] hover:border-[#3B7EF8]'}`}
      >
        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
    </div>
  );
}

// ─── Date cell ────────────────────────────────────────────────────────────────

function DateCell({ value, onUpdate }: CellProps) {
  const dateStr = value ? String(value).split('T')[0] : '';
  return (
    <input
      type="date"
      value={dateStr}
      onChange={e => onUpdate(e.target.value || null)}
      className="w-full text-center bg-transparent text-[10px] font-medium text-slate-400 border-none outline-none cursor-pointer focus:ring-0"
    />
  );
}

// ─── Dropdown cell (labels without cycling — opens a list) ───────────────────

function DropdownCell({ column, value, onUpdate }: CellProps) {
  const labels = getLabelOptions(column)?.labels ?? [];
  const curr = String(value ?? '');
  const label = labels.find(l => l.id === curr);

  return (
    <select
      value={curr}
      onChange={e => onUpdate(e.target.value || null)}
      className="w-full h-[28px] mx-2 bg-transparent border border-[var(--border-color)] rounded-lg text-[10px] font-medium text-center outline-none cursor-pointer"
      style={{ color: label?.color ?? '#6B7280' }}
    >
      <option value="">—</option>
      {labels.map(l => <option key={l.id} value={l.id} style={{ color: l.color }}>{l.title}</option>)}
    </select>
  );
}

// ─── People cell — minimal; PersonnelPicker integration stays in BoardView ───

function PeopleCell({ value }: CellProps) {
  const name = String(value || 'S/A');
  const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const colorClass = COLORS[hash % COLORS.length];
  return (
    <div className="flex items-center justify-center gap-1 px-2">
      <div className={`w-6 h-6 rounded-full ${colorClass} flex items-center justify-center text-white text-[10px] font-black uppercase`}>
        {name.charAt(0)}
      </div>
      <span className="text-[10px] text-slate-400 hidden xl:inline truncate max-w-[80px]">{name}</span>
    </div>
  );
}

// ─── Tags cell ────────────────────────────────────────────────────────────────

function TagsCell({ column, value, onUpdate }: CellProps) {
  const labels = getLabelOptions(column)?.labels ?? [];
  const selected = String(value ?? '').split(',').filter(Boolean);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id];
    onUpdate(next.join(',') || null);
  };
  return (
    <div className="flex flex-wrap gap-1 px-2 items-center justify-center">
      {labels.map(l => (
        <button
          key={l.id}
          onClick={() => toggle(l.id)}
          className="px-1.5 py-0.5 rounded text-[9px] font-bold transition-all"
          style={{
            backgroundColor: selected.includes(l.id) ? l.color : `${l.color}22`,
            color: selected.includes(l.id) ? '#fff' : l.color,
          }}
        >
          {l.title}
        </button>
      ))}
      {labels.length === 0 && <span className="text-[10px] text-slate-500">—</span>}
    </div>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────

// People cell is overridden in BoardView to integrate PersonnelPicker — this is the fallback.
const RENDERERS: Partial<Record<ColumnType | string, React.FC<CellProps>>> = {
  status:   StatusCell,
  priority: PriorityCell,
  text:     TextCell,
  numbers:  NumberCell,
  number:   NumberCell,
  checkbox: CheckboxCell,
  date:     DateCell,
  timeline: DateCell,
  dropdown: DropdownCell,
  tags:     TagsCell,
  people:   PeopleCell,
};

// ─── Public API ───────────────────────────────────────────────────────────────

interface CellRendererProps {
  column: Column;
  item: Item;
  onUpdate: (colKey: string, value: string | number | null) => void;
  /** Override for types that need parent-level state (e.g. people → PersonnelPicker) */
  override?: React.ReactNode;
}

export function CellRenderer({ column, item, onUpdate, override }: CellRendererProps) {
  if (column.hidden) return null;

  const key = getColumnValueKey(column);
  const value = (item.values as Record<string, unknown>)[key] as string | number | null | undefined;

  if (override !== undefined) {
    return <>{override}</>;
  }

  const Renderer = RENDERERS[column.type] ?? TextCell;
  return (
    <Renderer
      column={column}
      value={value}
      item={item}
      onUpdate={(v) => onUpdate(key, v)}
    />
  );
}
