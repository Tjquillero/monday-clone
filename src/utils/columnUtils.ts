import { Column, ColumnLabel, LabelOptions, PeopleOptions, DateOptions, NumberOptions } from '@/types/monday';

// ─── board_columns.key — CONTRACT ─────────────────────────────────────────────
//
// `key` is a stable semantic identifier for a column, separate from its UUID `id`.
// It is the key used to read and write values inside `items.values` (JSONB).
//
// Rules:
//   1. System/motor columns MUST have a key. Reserved keys:
//        status · priority · people · date · timeline
//        numbers · text · checkbox · tags · owner · progress
//   2. User-created columns MUST have key = NULL. The UUID `id` is used as fallback.
//   3. Never reuse a reserved key for a user-created column.
//   4. The value stored in items.values is always the label `id`, never its `title`.
//      Changing a label's `id` requires a data migration of all affected items.values.
//
// Lookup pattern (single point of change):
//   item.values[getColumnValueKey(column)]
//
// ─── board_columns.options — FORMAT BY TYPE ───────────────────────────────────
//
// status / priority / dropdown / tags:  LabelOptions: { labels: [...], default?: string }
// people:                               PeopleOptions: { multiple?: boolean }
// date / timeline:                      DateOptions:   { includeTime?: boolean }
// numbers:                              NumberOptions:  { format?, decimals?, symbol? }
// text / checkbox:                      {} (reserved for future config)

/**
 * Returns the key used to read/write this column's value in items.values.
 *
 * - System columns (status, priority, …): column.key is a stable string → use it.
 * - User columns: column.key is null → fall back to column.id (UUID).
 *
 * This is the ONLY place in the codebase that should implement this logic.
 */
export function getColumnValueKey(column: Pick<Column, 'id' | 'key'>): string {
  return column.key ?? column.id;
}

// ─── Type-safe options accessors ──────────────────────────────────────────────

export function getLabelOptions(col: Column): LabelOptions | undefined {
  const labelTypes = ['status', 'priority', 'dropdown', 'tags'];
  if (!labelTypes.includes(col.type)) return undefined;
  const opts = col.options as LabelOptions | undefined;
  return opts?.labels ? opts : undefined;
}

export function getPeopleOptions(col: Column): PeopleOptions {
  return (col.type === 'people' ? col.options : undefined) as PeopleOptions ?? {};
}

export function getDateOptions(col: Column): DateOptions {
  return (['date', 'timeline'].includes(col.type) ? col.options : undefined) as DateOptions ?? {};
}

export function getNumberOptions(col: Column): NumberOptions {
  return (['numbers', 'number'].includes(col.type) ? col.options : undefined) as NumberOptions ?? {};
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

export function getColumnLabel(column: Column, value: string): ColumnLabel | undefined {
  return getLabelOptions(column)?.labels?.find(l => l.id === value);
}

/** Returns the display color for a value. Falls back to neutral gray. */
export function getColumnLabelColor(column: Column, value: string): string {
  return getColumnLabel(column, value)?.color ?? '#334155';
}

/** Returns the display title for a value. Falls back to the raw stored value. */
export function getColumnLabelTitle(column: Column, value: string): string {
  return getColumnLabel(column, value)?.title ?? value;
}

/** Cycles to the next label id in the labels array. */
export function getNextLabelId(column: Column, currentId: string): string {
  const labels = getLabelOptions(column)?.labels;
  if (!labels || labels.length === 0) return currentId;
  const idx = labels.findIndex(l => l.id === currentId);
  return labels[(idx + 1) % labels.length].id;
}

/** Returns the default label id, or the first label if no default is set. */
export function getDefaultLabelId(column: Column): string {
  const opts = getLabelOptions(column);
  if (!opts?.labels?.length) return '';
  return opts.default ?? opts.labels[0].id;
}
