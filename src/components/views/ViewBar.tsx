'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { Filter, ArrowUpDown, Columns3, Save, Plus, Trash2, Check, X, ChevronDown } from 'lucide-react';
import { Column, ColumnType } from '@/types/monday';
import { FilterRule, SortRule, BoardView, FilterOperator, SortDirection } from '@/types/views';
import { getLabelOptions, getColumnValueKey } from '@/utils/columnUtils';

// ─── Filter operator labels ────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is:           'es',
  is_not:       'no es',
  contains:     'contiene',
  not_contains: 'no contiene',
  is_empty:     'está vacío',
  is_not_empty: 'no está vacío',
};

const TEXT_OPERATORS: FilterOperator[] = ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
const LABEL_OPERATORS: FilterOperator[] = ['is', 'is_not', 'is_empty', 'is_not_empty'];
const ANY_OPERATORS: FilterOperator[] = ['contains', 'not_contains', 'is_empty', 'is_not_empty'];

function operatorsFor(type: ColumnType | string): FilterOperator[] {
  if (['status', 'priority', 'dropdown', 'tags'].includes(type)) return LABEL_OPERATORS;
  if (type === 'checkbox') return ['is', 'is_not'];
  return TEXT_OPERATORS;
}

// ─── Filter chip ───────────────────────────────────────────────────────────────

interface FilterChipProps {
  rule: FilterRule;
  column: Column | undefined;
  onUpdate: (patch: Partial<FilterRule>) => void;
  onRemove: () => void;
}

function FilterChip({ rule, column, onUpdate, onRemove }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const operators = column ? operatorsFor(column.type) : TEXT_OPERATORS;
  const labels = column ? getLabelOptions(column)?.labels ?? [] : [];
  const needsValue = rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty';
  const isLabelType = labels.length > 0;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selectedValues = Array.isArray(rule.value) ? rule.value : rule.value ? [rule.value] : [];

  const toggleLabel = (id: string) => {
    const next = selectedValues.includes(id) ? selectedValues.filter(v => v !== id) : [...selectedValues, id];
    onUpdate({ value: next });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all ${open ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/40 text-[#3B7EF8]' : 'bg-[var(--bg-secondary)]/30 border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#3B7EF8]/30'}`}
      >
        <span className="font-black">{column?.title ?? rule.columnKey}</span>
        <span className="opacity-60">{OPERATOR_LABELS[rule.operator]}</span>
        {needsValue && selectedValues.length > 0 && (
          <span className="bg-[#3B7EF8] text-white rounded px-1">{selectedValues.length > 1 ? `${selectedValues.length}` : (isLabelType ? labels.find(l => l.id === selectedValues[0])?.title : selectedValues[0]) ?? selectedValues[0]}</span>
        )}
        <ChevronDown size={10} className="opacity-40" />
      </button>
      <button onClick={onRemove} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-all">
        <X size={8} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Operator */}
          <div className="p-2 border-b border-[var(--border-color)]">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Condición</p>
            <div className="flex flex-wrap gap-1">
              {operators.map(op => (
                <button
                  key={op}
                  onClick={() => onUpdate({ operator: op })}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${rule.operator === op ? 'bg-[#3B7EF8] text-white' : 'bg-[var(--bg-secondary)]/30 text-[var(--text-secondary)] hover:bg-[#3B7EF8]/10'}`}
                >
                  {OPERATOR_LABELS[op]}
                </button>
              ))}
            </div>
          </div>

          {/* Value */}
          {needsValue && (
            <div className="p-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Valor</p>
              {isLabelType ? (
                <div className="space-y-1">
                  {labels.map(l => (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(l.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)]/30 transition-all text-left"
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="text-[11px] font-medium text-[var(--text-primary)] flex-1">{l.title}</span>
                      {selectedValues.includes(l.id) && <Check size={11} className="text-[#3B7EF8]" />}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  value={Array.isArray(rule.value) ? rule.value[0] ?? '' : rule.value ?? ''}
                  onChange={e => onUpdate({ value: e.target.value })}
                  placeholder="Valor..."
                  className="w-full text-[11px] px-2 py-1.5 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-lg outline-none focus:border-[#3B7EF8]/50"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sort pill ────────────────────────────────────────────────────────────────

interface SortPillProps {
  rule: SortRule;
  onToggle: () => void;
  onRemove: () => void;
}

function SortPill({ rule, onToggle, onRemove }: SortPillProps) {
  return (
    <div className="group relative flex items-center gap-1 h-7 px-2.5 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-lg text-[10px] font-bold text-[var(--text-secondary)] hover:border-[#3B7EF8]/30 transition-all">
      <span>{rule.columnTitle}</span>
      <button onClick={onToggle} className="text-[#3B7EF8] font-black">{rule.direction === 'asc' ? '↑' : '↓'}</button>
      <button onClick={onRemove} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
        <X size={8} />
      </button>
    </div>
  );
}

// ─── Column visibility toggle ─────────────────────────────────────────────────

interface ColumnToggleProps {
  columns: Column[];
  visibleIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}

function ColumnToggle({ columns, visibleIds, onToggle, onClose }: ColumnToggleProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const effectiveVisible = visibleIds.length ? visibleIds : columns.map(c => getColumnValueKey(c));

  return (
    <div ref={ref} className="absolute top-full right-0 mt-1 w-52 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-color)]">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Columnas visibles</p>
      </div>
      <div className="py-1 max-h-64 overflow-y-auto custom-scrollbar">
        {columns.map(col => {
          const colKey = getColumnValueKey(col);
          const visible = effectiveVisible.includes(colKey);
          return (
            <button
              key={col.id}
              onClick={() => onToggle(colKey)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-secondary)]/30 transition-all text-left"
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${visible ? 'bg-[#3B7EF8] border-[#3B7EF8]' : 'border-[var(--border-color)]'}`}>
                {visible && <Check size={10} className="text-white" />}
              </div>
              <span className="text-[11px] font-medium text-[var(--text-primary)]">{col.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add filter popover ────────────────────────────────────────────────────────

interface AddFilterProps {
  columns: Column[];
  onAdd: (rule: FilterRule) => void;
  onClose: () => void;
}

function AddFilterPopover({ columns, onAdd, onClose }: AddFilterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 w-52 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-color)]">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Filtrar por columna</p>
      </div>
      <div className="py-1 max-h-60 overflow-y-auto custom-scrollbar">
        {columns.map(col => {
          const defaultOp = operatorsFor(col.type)[0];
          const labels = getLabelOptions(col)?.labels ?? [];
          const defaultVal = labels.length ? [] : '';
          return (
            <button
              key={col.id}
              onClick={() => {
                onAdd({ id: `${uid}-${col.id}`, columnKey: getColumnValueKey(col), columnType: col.type, operator: defaultOp, value: defaultVal });
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#3B7EF8]/5 transition-all text-left"
            >
              <span className="text-[11px] font-medium text-[var(--text-primary)]">{col.title}</span>
              <span className="ml-auto text-[9px] text-slate-500 uppercase">{col.type}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Save view modal ──────────────────────────────────────────────────────────

interface SaveViewModalProps {
  currentName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

function SaveViewModal({ currentName, onSave, onClose }: SaveViewModalProps) {
  const [name, setName] = useState(currentName === 'Sin filtros' ? '' : currentName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-80 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5">
        <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-primary)] mb-4">Guardar vista</h3>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSave(name.trim())}
          placeholder="Nombre de la vista..."
          autoFocus
          className="w-full px-3 py-2 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[#3B7EF8]/50 mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
            className="flex-1 py-2 bg-[#3B7EF8] hover:bg-[#2563EB] text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
          >
            Guardar
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl text-[11px] font-black uppercase tracking-widest hover:border-slate-400 transition-all">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ViewBar (main export) ────────────────────────────────────────────────────

interface ViewBarProps {
  columns: Column[];
  savedViews: BoardView[];
  activeView: BoardView;
  isDirty: boolean;
  onLoadView: (view: BoardView) => void;
  onAddFilter: (rule: FilterRule) => void;
  onUpdateFilter: (id: string, patch: Partial<FilterRule>) => void;
  onRemoveFilter: (id: string) => void;
  onClearFilters: () => void;
  onAddSort: (rule: SortRule) => void;
  onRemoveSort: (id: string) => void;
  onToggleSortDir: (id: string) => void;
  onToggleColumn: (columnId: string) => void;
  onSaveView: (name: string) => void;
  onDeleteView?: (id: string) => void;
  onReset: () => void;
}

export function ViewBar({
  columns, savedViews, activeView, isDirty,
  onLoadView, onAddFilter, onUpdateFilter, onRemoveFilter, onClearFilters,
  onAddSort, onRemoveSort, onToggleSortDir, onToggleColumn,
  onSaveView, onDeleteView, onReset,
}: ViewBarProps) {
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [showColToggle, setShowColToggle] = useState(false);
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  // Close view menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setShowViewMenu(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSortPicker(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const hasFilters = activeView.filters.length > 0;
  const hasSorts = activeView.sorts.length > 0;
  const hiddenCount = activeView.visibleColumns.length > 0 ? (columns.length - activeView.visibleColumns.length) : 0;
  const isLocalView = activeView.id === '__local__';

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-primary)]/50 backdrop-blur-sm overflow-x-auto custom-scrollbar flex-nowrap">

        {/* Saved views tabs */}
        <div ref={viewMenuRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowViewMenu(!showViewMenu)}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${showViewMenu ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/30 text-[#3B7EF8]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#3B7EF8]/20'}`}
          >
            {isLocalView ? 'Vista actual' : activeView.name}
            <ChevronDown size={10} />
          </button>
          {showViewMenu && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden">
              <button
                onClick={() => { onReset(); setShowViewMenu(false); }}
                className="w-full px-3 py-2 text-left text-[11px] font-medium hover:bg-[var(--bg-secondary)]/30 transition-all text-[var(--text-secondary)]"
              >
                Sin filtros
              </button>
              {savedViews.length > 0 && <div className="border-t border-[var(--border-color)] my-1" />}
              {savedViews.map(v => (
                <div key={v.id} className="flex items-center group/vi">
                  <button
                    onClick={() => { onLoadView(v); setShowViewMenu(false); }}
                    className={`flex-1 px-3 py-2 text-left text-[11px] font-medium hover:bg-[var(--bg-secondary)]/30 transition-all ${activeView.id === v.id ? 'text-[#3B7EF8] font-bold' : 'text-[var(--text-primary)]'}`}
                  >
                    {v.name}
                    {v.isDefault && <span className="ml-2 text-[9px] text-slate-500 uppercase">def</span>}
                  </button>
                  {onDeleteView && (
                    <button
                      onClick={() => onDeleteView(v.id)}
                      className="opacity-0 group-hover/vi:opacity-100 px-2 py-2 text-rose-500 hover:bg-rose-500/10 transition-all"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-[var(--border-color)] flex-shrink-0" />

        {/* Active filter chips */}
        {activeView.filters.map(rule => (
          <div key={rule.id} className="group relative flex-shrink-0">
            <FilterChip
              rule={rule}
              column={columns.find(c => getColumnValueKey(c) === rule.columnKey)}
              onUpdate={patch => onUpdateFilter(rule.id, patch)}
              onRemove={() => onRemoveFilter(rule.id)}
            />
          </div>
        ))}

        {/* Sort pills */}
        {activeView.sorts.map(rule => (
          <SortPill
            key={rule.id}
            rule={rule}
            onToggle={() => onToggleSortDir(rule.id)}
            onRemove={() => onRemoveSort(rule.id)}
          />
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add filter */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowAddFilter(!showAddFilter)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${hasFilters ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/30 text-[#3B7EF8]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#3B7EF8]/20 hover:text-[#3B7EF8]'}`}
          >
            <Filter size={11} />
            Filtrar
            {hasFilters && <span className="bg-[#3B7EF8] text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{activeView.filters.length}</span>}
          </button>
          {showAddFilter && (
            <AddFilterPopover
              columns={columns}
              onAdd={onAddFilter}
              onClose={() => setShowAddFilter(false)}
            />
          )}
        </div>

        {/* Sort picker */}
        <div ref={sortRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowSortPicker(!showSortPicker)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${hasSorts ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/30 text-[#3B7EF8]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#3B7EF8]/20 hover:text-[#3B7EF8]'}`}
          >
            <ArrowUpDown size={11} />
            Ordenar
          </button>
          {showSortPicker && (
            <div className="absolute top-full right-0 mt-1 w-52 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border-color)]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Ordenar por</p>
              </div>
              <div className="py-1 max-h-60 overflow-y-auto custom-scrollbar">
                {columns.map(col => {
                  const existing = activeView.sorts.find(s => s.columnKey === getColumnValueKey(col));
                  return (
                    <button
                      key={col.id}
                      onClick={() => {
                        const key = getColumnValueKey(col);
                        if (existing) {
                          onToggleSortDir(existing.id);
                        } else {
                          onAddSort({ id: `${uid}-sort-${col.id}`, columnKey: key, columnTitle: col.title, direction: 'asc' });
                        }
                        setShowSortPicker(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#3B7EF8]/5 transition-all text-left"
                    >
                      <span className="text-[11px] font-medium text-[var(--text-primary)] flex-1">{col.title}</span>
                      {existing && <span className="text-[#3B7EF8] font-black text-sm">{existing.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Column visibility */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowColToggle(!showColToggle)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${hiddenCount > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#3B7EF8]/20 hover:text-[#3B7EF8]'}`}
          >
            <Columns3 size={11} />
            Columnas
            {hiddenCount > 0 && <span className="bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{hiddenCount}</span>}
          </button>
          {showColToggle && (
            <ColumnToggle
              columns={columns}
              visibleIds={activeView.visibleColumns}
              onToggle={onToggleColumn}
              onClose={() => setShowColToggle(false)}
            />
          )}
        </div>

        {/* Clear / Save */}
        {(hasFilters || hasSorts || hiddenCount > 0) && (
          <>
            <button onClick={onClearFilters} className="flex items-center gap-1 h-7 px-2 rounded-lg text-[10px] font-black text-slate-500 hover:text-rose-500 transition-all" title="Limpiar filtros">
              <X size={11} /> Limpiar
            </button>
            {isDirty && (
              <button
                onClick={() => setShowSaveModal(true)}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[#3B7EF8] text-white hover:bg-[#2563EB] transition-all"
              >
                <Save size={11} /> Guardar vista
              </button>
            )}
          </>
        )}
      </div>

      {showSaveModal && (
        <SaveViewModal
          currentName={activeView.name}
          onSave={(name) => { onSaveView(name); setShowSaveModal(false); }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </>
  );
}
