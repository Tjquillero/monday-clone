import { ColumnType } from './monday';

// ─── Filter ───────────────────────────────────────────────────────────────────

export type FilterOperator =
  | 'is'            // exact match (label id)
  | 'is_not'        // not exact match
  | 'contains'      // substring (text)
  | 'not_contains'  // not substring
  | 'is_empty'      // null / ''
  | 'is_not_empty'; // not null / ''

export interface FilterRule {
  id: string;
  columnKey: string;    // getColumnValueKey() result — stable lookup key
  columnType: ColumnType | string;
  operator: FilterOperator;
  value: string | string[];  // string[] for multi-select (is / is_not with labels)
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  id: string;
  columnKey: string;
  columnTitle: string;
  direction: SortDirection;
}

// ─── View ─────────────────────────────────────────────────────────────────────

export interface BoardView {
  id: string;
  boardId: string;
  name: string;
  isDefault?: boolean;
  filters: FilterRule[];
  sorts: SortRule[];
  visibleColumns: string[];  // column ids; empty = show all
  groupBy?: string;          // column key to group by (future)
  createdBy?: string;
  createdAt?: string;
}

// Blank view — no filters, no sorts, all columns visible
export const BLANK_VIEW: Omit<BoardView, 'id' | 'boardId'> = {
  name: 'Sin filtros',
  filters: [],
  sorts: [],
  visibleColumns: [],
};
