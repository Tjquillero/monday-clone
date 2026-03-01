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
}

export interface Group {
  id: string;
  title: string;
  color: string;
  items: Item[];
}

export interface Column {
  id: string;
  title: string;
  type: string;
  width: number;
  position?: number;
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
  factor: number;
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
