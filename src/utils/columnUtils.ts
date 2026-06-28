import { Column, ColumnLabel } from '@/types/monday';

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
// status / priority:
//   {
//     labels: [{ id: string, title: string, color: string }],
//     default: string   // must match a label id
//   }
//   - `id` values MUST match what is stored in items.values (see Rule 4 above).
//   - Current status ids:  "Not Started" | "Working on it" | "Done" | "Stuck"
//   - Current priority ids: "Low" | "Medium" | "High"
//
// people:
//   { multiple: boolean }
//
// date / timeline:
//   { includeTime: boolean }
//
// numbers:
//   { format: "number" | "currency", decimals: number, symbol?: string }
//
// text / checkbox / tags:
//   {}   (empty object, reserved for future config)

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

/**
 * Returns the label definition for a given stored value,
 * using the column's options.labels array.
 */
export function getColumnLabel(column: Column, value: string): ColumnLabel | undefined {
  return column.options?.labels?.find(l => l.id === value);
}

/** Returns the display color for a value. Falls back to neutral gray. */
export function getColumnLabelColor(column: Column, value: string): string {
  return getColumnLabel(column, value)?.color ?? '#334155';
}

/** Returns the display title for a value. Falls back to the raw stored value. */
export function getColumnLabelTitle(column: Column, value: string): string {
  return getColumnLabel(column, value)?.title ?? value;
}
