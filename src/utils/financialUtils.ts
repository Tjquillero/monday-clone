import { Item, Column } from '@/types/monday';
import { getColumnValueKey } from './columnUtils';
import { isFinancialItem } from './itemUtils';

export interface FinancialColumns {
  priceColKey: string;
  qtyColKey: string;
  unitColKey: string;
  catColKey: string;
  typeColKey: string;
}

export interface FinancialValues {
  quantity: number;
  executedQty: number;
  unitPrice: number;
  unit: string;
  budgetTotal: number;
  executedTotal: number;
  compliance: number;
  category: string;
  rubro: string;
}

// Column finders use title matching only — c.id is a UUID for real columns and
// must never be compared against legacy phantom IDs like 'unit_price' or 'cant'.
// The fallback key strings ('unit_price', 'cant', etc.) are legacy sentinels used
// only when no column is found in boards created before templates existed.
// Remove fallbacks after boards are migrated (Phase 2.2).
export function resolveFinancialColumns(columns: Column[]): FinancialColumns {
  const priceCol = columns.find(c => ['precio', 'costo', 'valor', 'p.u', 'pu'].some(term => c.title.toLowerCase().includes(term)));
  const priceColKey = priceCol ? getColumnValueKey(priceCol) : 'unit_price'; // Legacy fallback

  const qtyCol = columns.find(c => ['cant', 'm2', 'volumen', 'metrado', 'cantidad'].some(term => c.title.toLowerCase().includes(term)));
  const qtyColKey = qtyCol ? getColumnValueKey(qtyCol) : 'cant'; // Legacy fallback

  const unitCol = columns.find(c => ['und', 'unidad', 'medida'].some(term => c.title.toLowerCase().includes(term)));
  const unitColKey = unitCol ? getColumnValueKey(unitCol) : 'unit'; // Legacy fallback

  const catCol = columns.find(c => c.title.toLowerCase().includes('categ') || c.title.toLowerCase().includes('sub'));
  const catColKey = catCol ? getColumnValueKey(catCol) : 'category'; // Legacy fallback

  const typeCol = columns.find(c => c.id !== (catCol?.id ?? '') && ['rubro', 'tipo', 'clase', 'grupo'].some(term => c.title.toLowerCase().includes(term)));
  const typeColKey = typeCol ? getColumnValueKey(typeCol) : 'rubro'; // Legacy fallback

  return { priceColKey, qtyColKey, unitColKey, catColKey, typeColKey };
}

export function getExecutedQuantity(item: Item): number {
  const vals = item.values || {};
  let executedQty = Number(vals.executed_qty) || 0;
  const dailyExec = vals.daily_execution || {};
  if (executedQty === 0 && Object.keys(dailyExec).length > 0) {
    executedQty = Object.values(dailyExec).reduce((acc: number, val: any) => {
      const v = typeof val === 'object' ? (val.val || 0) : (parseFloat(val) || 0);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  }
  return executedQty;
}

export function getFinancialValues(item: Item, columns: Column[], resolvedCols?: FinancialColumns): FinancialValues {
  const vals = item.values || {};
  const isFin = isFinancialItem(item);
  const cols = resolvedCols || resolveFinancialColumns(columns);

  // Primary path: resolved column key (UUID for template columns, semantic string for legacy).
  // Fallback strings ('unit_price', 'cant', etc.) handle items in boards created before
  // templates existed, where values were stored under legacy phantom keys.
  // Remove fallbacks after Phase 2.2 board migration completes.
  const unitPrice = isFin ? (Number(vals.unit_price) || 0) : (Number(vals[cols.priceColKey]) || Number(vals.unit_price) || 0);
  const quantity  = isFin ? (Number(vals.cant) || 0)       : (Number(vals[cols.qtyColKey])   || Number(vals.cant) || 0);
  const unit      = isFin ? (vals.unit || 'Und')           : String(vals[cols.unitColKey] || vals.unit || 'Und');
  const category  = isFin ? (vals.category || 'Sin Categoría')          : String(vals[cols.catColKey]  || vals.category || 'Sin Categoría');
  const rubro     = isFin ? (vals.rubro || 'Otros Costos Directos')     : String(vals[cols.typeColKey] || vals.rubro    || 'Otros Costos Directos');

  const executedQty = getExecutedQuantity(item);

  const budgetTotal = unitPrice * quantity;
  const executedTotal = unitPrice * executedQty;
  const compliance = quantity > 0 ? (executedQty / quantity) * 100 : 0;

  return {
    quantity,
    executedQty,
    unitPrice,
    unit,
    budgetTotal,
    executedTotal,
    compliance,
    category,
    rubro
  };
}
