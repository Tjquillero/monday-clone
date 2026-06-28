import { Column, ColumnLabel } from '@/types/monday';

/**
 * Returns the key used to read/write this column's value in item.values.
 * Motor columns (status, priority, etc.) store values under a stable string key.
 * User-created columns store values under their UUID id.
 */
export function getColumnValueKey(column: Column): string {
  return column.key ?? column.id;
}

/**
 * Returns the label definition for a given value stored in item.values,
 * using the column's options.labels array.
 * Falls back to undefined if the column has no labels or the value is not found.
 */
export function getColumnLabel(column: Column, value: string): ColumnLabel | undefined {
  return column.options?.labels?.find(l => l.id === value);
}

/**
 * Returns the display color for a value, falling back to a neutral gray.
 */
export function getColumnLabelColor(column: Column, value: string): string {
  return getColumnLabel(column, value)?.color ?? '#334155';
}

/**
 * Returns the display title for a value (i18n label), falling back to the raw value.
 */
export function getColumnLabelTitle(column: Column, value: string): string {
  return getColumnLabel(column, value)?.title ?? value;
}
