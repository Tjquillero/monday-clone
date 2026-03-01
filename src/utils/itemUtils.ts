import { Item } from '@/types/monday';

export const isFinancialItem = (i: Item): boolean => {
  // Check discriminator in values (primary for new logic)
  if (i.values?.item_type === 'financial') return true;
  if (i.values?.item_type === 'activity') return false;
  
  // Legacy / Fallback column check
  if (i.item_type === 'financial') return true;
  if (i.item_type === 'activity') return false;
  
  // Fallback: only if explicitly marked as financial
  return false; 
};

export const isActivityItem = (i: Item): boolean => !isFinancialItem(i);
