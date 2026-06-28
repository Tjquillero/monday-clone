'use client';

import { useState, useMemo, useCallback } from 'react';
import { Group, Item, Column } from '@/types/monday';
import { BoardView, FilterRule, SortRule, FilterOperator, BLANK_VIEW } from '@/types/views';

// ─── Filter engine ────────────────────────────────────────────────────────────

function applyFilter(item: Item, rule: FilterRule): boolean {
  const raw = (item.values as Record<string, unknown>)[rule.columnKey];
  const val = raw == null ? '' : String(raw);

  switch (rule.operator as FilterOperator) {
    case 'is':
      if (Array.isArray(rule.value)) return rule.value.includes(val);
      return val === rule.value;
    case 'is_not':
      if (Array.isArray(rule.value)) return !rule.value.includes(val);
      return val !== rule.value;
    case 'contains':
      return val.toLowerCase().includes(String(rule.value).toLowerCase());
    case 'not_contains':
      return !val.toLowerCase().includes(String(rule.value).toLowerCase());
    case 'is_empty':
      return val === '' || val === 'null' || val === 'undefined';
    case 'is_not_empty':
      return val !== '' && val !== 'null' && val !== 'undefined';
    default:
      return true;
  }
}

// ─── Sort engine ──────────────────────────────────────────────────────────────

function compareItems(a: Item, b: Item, sorts: SortRule[]): number {
  for (const sort of sorts) {
    const av = String((a.values as Record<string, unknown>)[sort.columnKey] ?? '');
    const bv = String((b.values as Record<string, unknown>)[sort.columnKey] ?? '');
    const n = av.localeCompare(bv, 'es', { numeric: true });
    if (n !== 0) return sort.direction === 'asc' ? n : -n;
  }
  return 0;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface ActiveView extends BoardView {
  isDirty: boolean;
}

export function useBoardView(
  groups: Group[] | undefined,
  columns: Column[] | undefined,
  initialView?: Partial<BoardView>
) {
  const [activeView, setActiveView] = useState<BoardView>({
    id: '__local__',
    boardId: '',
    name: 'Sin filtros',
    filters: initialView?.filters ?? [],
    sorts: initialView?.sorts ?? [],
    visibleColumns: initialView?.visibleColumns ?? [],
    ...initialView,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(activeView));

  const isDirty = JSON.stringify(activeView) !== savedSnapshot;

  // ── Public setters ─────────────────────────────────────────────────────────

  const addFilter = useCallback((rule: FilterRule) => {
    setActiveView(v => ({ ...v, filters: [...v.filters, rule] }));
  }, []);

  const updateFilter = useCallback((id: string, patch: Partial<FilterRule>) => {
    setActiveView(v => ({ ...v, filters: v.filters.map(f => f.id === id ? { ...f, ...patch } : f) }));
  }, []);

  const removeFilter = useCallback((id: string) => {
    setActiveView(v => ({ ...v, filters: v.filters.filter(f => f.id !== id) }));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveView(v => ({ ...v, filters: [] }));
  }, []);

  const addSort = useCallback((rule: SortRule) => {
    setActiveView(v => ({
      ...v,
      sorts: [...v.sorts.filter(s => s.columnKey !== rule.columnKey), rule],
    }));
  }, []);

  const removeSort = useCallback((id: string) => {
    setActiveView(v => ({ ...v, sorts: v.sorts.filter(s => s.id !== id) }));
  }, []);

  const toggleColumn = useCallback((columnId: string) => {
    setActiveView(v => {
      const allIds = columns?.map(c => c.id) ?? [];
      const current = v.visibleColumns.length ? v.visibleColumns : allIds;
      const next = current.includes(columnId)
        ? current.filter(id => id !== columnId)
        : [...current, columnId];
      return { ...v, visibleColumns: next.length === allIds.length ? [] : next };
    });
  }, [columns]);

  const loadView = useCallback((view: BoardView) => {
    setActiveView(view);
    setSavedSnapshot(JSON.stringify(view));
  }, []);

  const markSaved = useCallback((savedId?: string) => {
    setActiveView(v => savedId ? { ...v, id: savedId } : v);
    setSavedSnapshot(JSON.stringify({ ...activeView, id: savedId ?? activeView.id }));
  }, [activeView]);

  const reset = useCallback(() => {
    setActiveView(v => ({ ...v, ...BLANK_VIEW }));
    setSavedSnapshot(JSON.stringify({ ...activeView, ...BLANK_VIEW }));
  }, [activeView]);

  // ── Computed groups (filtered + sorted) ────────────────────────────────────

  const filteredGroups = useMemo<Group[]>(() => {
    if (!groups) return [];
    if (!activeView.filters.length && !activeView.sorts.length) return groups;

    return groups.map(g => {
      let items = [...g.items];

      // Apply all filter rules (AND logic)
      if (activeView.filters.length) {
        items = items.filter(item =>
          activeView.filters.every(rule => applyFilter(item, rule))
        );
      }

      // Apply sorts
      if (activeView.sorts.length) {
        items = [...items].sort((a, b) => compareItems(a, b, activeView.sorts));
      }

      return { ...g, items };
    });
  }, [groups, activeView.filters, activeView.sorts]);

  // ── Visible columns ────────────────────────────────────────────────────────

  const visibleColumns = useMemo<Column[]>(() => {
    if (!columns) return [];
    if (!activeView.visibleColumns.length) return columns;
    return columns.filter(c => activeView.visibleColumns.includes(c.id));
  }, [columns, activeView.visibleColumns]);

  return {
    activeView,
    isDirty,
    filteredGroups,
    visibleColumns,
    addFilter,
    updateFilter,
    removeFilter,
    clearFilters,
    addSort,
    removeSort,
    toggleColumn,
    loadView,
    markSaved,
    reset,
  };
}
