import { resolveFinancialColumns, getFinancialValues, getExecutedQuantity } from './financialUtils';
import { Column, Item } from '@/types/monday';

describe('financialUtils', () => {
  const mockColumns: Column[] = [
    { id: 'col_price', title: 'Precio Unitario', type: 'number', position: 0 } as Column,
    { id: 'col_qty', title: 'Cantidad', type: 'number', position: 1 } as Column,
    { id: 'col_unit', title: 'Unidad', type: 'text', position: 2 } as Column,
    { id: 'category', title: 'Categoria Detallada', type: 'text', position: 3 } as Column,
    { id: 'rubro', title: 'Rubro Principal', type: 'text', position: 4 } as Column,
  ];

  describe('resolveFinancialColumns', () => {
    it('should resolve dynamic columns correctly', () => {
      const cols = resolveFinancialColumns(mockColumns);
      expect(cols.priceColKey).toBe('col_price');
      expect(cols.qtyColKey).toBe('col_qty');
      expect(cols.unitColKey).toBe('col_unit');
      expect(cols.catColKey).toBe('category');
      expect(cols.typeColKey).toBe('rubro');
    });
  });

  describe('getExecutedQuantity', () => {
    it('should return manual override if present', () => {
      const item = { values: { executed_qty: 15 } } as unknown as Item;
      expect(getExecutedQuantity(item)).toBe(15);
    });

    it('should fallback to daily execution sum if manual override is missing', () => {
      const item = {
        values: {
          daily_execution: {
            '2026-06-28': 5,
            '2026-06-29': { val: 3 },
            '2026-06-30': 2
          }
        }
      } as unknown as Item;
      expect(getExecutedQuantity(item)).toBe(10);
    });
  });

  describe('getFinancialValues', () => {
    it('should extract values correctly for a financial item using fixed keys', () => {
      const item: Item = {
        id: '1',
        name: 'Financial Item',
        values: {
          item_type: 'financial',
          unit_price: 150,
          cant: 10,
          unit: 'M3',
          category: 'Concreto',
          rubro: 'Materiales',
          executed_qty: 4
        }
      } as Item;

      const vals = getFinancialValues(item, mockColumns);
      expect(vals.unitPrice).toBe(150);
      expect(vals.quantity).toBe(10);
      expect(vals.unit).toBe('M3');
      expect(vals.category).toBe('Concreto');
      expect(vals.rubro).toBe('Materiales');
      expect(vals.executedQty).toBe(4);
      expect(vals.budgetTotal).toBe(1500);
      expect(vals.executedTotal).toBe(600);
      expect(vals.compliance).toBe(40);
    });

    it('should extract values correctly for an activity item using dynamic columns', () => {
      const item: Item = {
        id: '2',
        name: 'Activity Item',
        values: {
          item_type: 'activity',
          col_price: 200,
          col_qty: 5,
          col_unit: 'Hrs',
          category: 'Labor',
          rubro: 'Mano de Obra',
          daily_execution: {
            '2026-06-28': 2,
            '2026-06-29': 1
          }
        }
      } as Item;

      const vals = getFinancialValues(item, mockColumns);
      expect(vals.unitPrice).toBe(200);
      expect(vals.quantity).toBe(5);
      expect(vals.unit).toBe('Hrs');
      expect(vals.category).toBe('Labor');
      expect(vals.rubro).toBe('Mano de Obra');
      expect(vals.executedQty).toBe(3);
      expect(vals.budgetTotal).toBe(1000);
      expect(vals.executedTotal).toBe(600);
      expect(vals.compliance).toBe(60);
    });
  });
});
