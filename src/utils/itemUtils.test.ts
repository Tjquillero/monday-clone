import { isFinancialItem, isActivityItem } from './itemUtils';
import { Item } from '@/types/monday';

describe('itemUtils', () => {
  const mockItem: Item = {
    id: '1',
    name: 'Test Item',
    values: {}
  } as Item;

  describe('isFinancialItem', () => {
    it('should return true if values.item_type is financial', () => {
      const item = { ...mockItem, values: { item_type: 'financial' } };
      expect(isFinancialItem(item)).toBe(true);
    });

    it('should return false if values.item_type is activity', () => {
      const item = { ...mockItem, values: { item_type: 'activity' } };
      expect(isFinancialItem(item)).toBe(false);
    });

    it('should NOT fallback to rubro check (strict mode)', () => {
      const itemWithRubro = { ...mockItem, values: { rubro: 'Materials' } };
      expect(isFinancialItem(itemWithRubro)).toBe(false);
    });
  });

  describe('isActivityItem', () => {
    it('should return the inverse of isFinancialItem', () => {
      const item = { ...mockItem, values: { item_type: 'financial' } };
      expect(isActivityItem(item)).toBe(false);
      
      const activityItem = { ...mockItem, values: { item_type: 'activity' } };
      expect(isActivityItem(activityItem)).toBe(true);
    });
  });
});
