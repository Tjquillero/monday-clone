export interface Board {
  id: string;
  name: string;
  description?: string;
  settings?: any;
}

export interface Item {
  id: number | string;
  name: string;
  values: Record<string, any>; // Includes 'evidence' as array of { url: string, timestamp: string, userId: string }
  item_type?: 'activity' | 'financial'; // Discriminator
  description?: string;
  personnel_id?: string;
  personnel?: Personnel;
  subItems?: Item[];
  parent_id?: string | number;
  group_id?: string | number;
  position?: number;
  lat?: number;
  lng?: number;
}

export interface Group {
  id: string;
  title: string;
  color: string;
  items: Item[];
  lat?: number;
  lng?: number;
}

// All valid column types. Add new types here — renderer registry in CellRenderer.tsx must match.
export type ColumnType =
  | 'status'
  | 'priority'
  | 'people'
  | 'date'
  | 'numbers'
  | 'text'
  | 'checkbox'
  | 'tags'
  | 'timeline'
  | 'dropdown';

export interface ColumnLabel {
  id: string;
  title: string;
  color: string;
}

// Per-type options shapes. Values stored in board_columns.options JSONB.
// Use helper functions in columnUtils.ts to access these safely.
export interface LabelOptions {
  labels: ColumnLabel[];
  default?: string;
}
export interface PeopleOptions {
  multiple?: boolean;
}
export interface DateOptions {
  includeTime?: boolean;
}
export interface NumberOptions {
  format?: 'number' | 'currency';
  decimals?: number;
  symbol?: string;
}

// Union of all possible options shapes stored in board_columns.options
export type ColumnOptions = LabelOptions | PeopleOptions | DateOptions | NumberOptions | Record<string, never>;

/** @deprecated Use LabelOptions, PeopleOptions, DateOptions, NumberOptions directly */
export type LegacyColumnOptions = {
  labels?: ColumnLabel[];
  default?: string;
  multiple?: boolean;
  includeTime?: boolean;
  format?: string;
  decimals?: number;
  symbol?: string;
};

export interface Column {
  id: string;
  key?: string | null;     // stable lookup key for items.values (null → use id)
  title: string;
  type: ColumnType | string; // string fallback for unknown types from DB
  width: number;
  position?: number;
  options?: ColumnOptions;
  required?: boolean;
  editable?: boolean;
  hidden?: boolean;
}

export interface Personnel {
  id: string;
  name: string;
  role: string;
  default_rate?: number;
}

export interface ActivityTemplate {
  id: string;
  name: string;
  unit: string;
  rend: number;
  unit_price?: number;
  frequency?: number;
  category?: string;
  zone?: 'Zonas Verdes' | 'Zonas Duras' | 'Zona de Playa' | null;
  created_at?: string;
}

export interface Incident {
  id: number | string;
  type: string;
  description: string;
  severity: 'Low' | 'Medium' | 'Critical';
  photo?: string;
  date: string;
  itemId?: string | number;
  itemName?: string;
  siteName?: string;
  siteColor?: string;
  solution?: string;
  dbId?: string;
}

export interface Dependency {
  id: number | string;
  source_item_id: string | number;
  target_item_id: string | number;
  board_id: string;
  type?: 'Finish-to-Start' | 'Start-to-Start' | 'Finish-to-Finish' | 'Start-to-Finish';
  lag?: number;
}

export interface ResourceAnalysisDBRow {
  id?: string;
  board_id: string;
  site_id: string;
  scope_data: Record<string, number>;
  workers_data: Record<string, number>;
  wages_data: number;
  updated_at?: string;
}

export interface EfficiencyRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  rendimiento: number;
  frecuencia: number;
  scopeName: string;
  qty: number;
  theoretical: number;
  real: number;
  savings: number;
  activityValue: number;
}
// Actas (Progress Billing) Interfaces
export interface Acta {
  id: string;
  board_id: string;
  name: string;
  date: string;
  period_start?: string;
  period_end?: string;
  status: 'draft' | 'approved' | 'paid';
  observations?: string;
  created_at?: string;
}

export interface Dependency {
  id: string | number;
  source_item_id: string | number;
  target_item_id: string | number;
}

export interface ActaDetail {
  id: string;
  acta_id: string;
  item_id: string; // Budget item ID
  group_id: string; // Site ID
  quantity: number;
  value: number;
  previous_qty?: number;   // Manual override for ACTAS ANTERIORES qty
  previous_value?: number; // Manual override for ACTAS ANTERIORES value
  percentage?: number;
  created_at?: string;
}

// Actas Certificadas (Incremento 5) — dominio POA/weekly_plan_item_executions.
// Sin relación con Acta/ActaDetail arriba (sistema histórico, financial_actas):
// ver docs/adr/ADR-0003-billing-source.md. Toda escritura pasa por RPC
// (generate_acta_draft/adjust_acta_item_quantity/issue_acta) — estos tipos
// son de solo lectura desde React.
export interface CertifiedActaItem {
  id: string;
  acta_id: string;
  poa_activity_id: string;
  descripcion_snapshot: string;
  unidad_snapshot: string;
  precio_unitario_snapshot: number;
  cantidad_facturada: number;
  valor_total: number;
  created_at: string;
  updated_at: string;
}

export interface CertifiedActaTotals {
  subtotal: number;
  administracion: number;
  imprevistos: number;
  utilidad: number;
  total_pagar: number;
}

export interface CertifiedActa {
  id: string;
  board_id: string;
  numero: number | null;
  estado: 'draft' | 'issued';
  fecha: string | null;
  observaciones: string | null;
  generated_by: string;
  generated_at: string;
  issued_by: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
  items: CertifiedActaItem[];
}
