import { Item } from '@/types/monday';

export const isFinancialItem = (i: Item): boolean => {
  // Check discriminator in values (primary for new logic)
  if (i.values?.item_type === 'financial') return true;
  if (i.values?.item_type === 'activity') return false;
  
  // Legacy / Fallback column check
  if (i.item_type === 'financial') return true;
  if (i.item_type === 'activity') return false;
  
  // If it has a rubro, it's likely a financial/budget item
  if (i.values?.rubro) return true;

  // Default to false (assume activity) to avoid breaking execution views
  return false; 
};

export const isActivityItem = (i: Item): boolean => !isFinancialItem(i);
