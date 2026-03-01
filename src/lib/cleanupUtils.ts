import { supabase } from '@/lib/supabaseClient';

export const cleanupLegacyPhotos = async (): Promise<{ checked: number, cleaned: number }> => {
  console.log("Starting cleanup of legacy photos...");
  let cleanedCount = 0;
  
  // 1. Fetch all items with their values
  const { data: items, error } = await supabase
    .from('items')
    .select('id, values');
    
  if (error) throw error;
  if (!items) return { checked: 0, cleaned: 0 };

  console.log(`Checking ${items.length} items for legacy data...`);

  // 2. Iterate and check
  for (const item of items) {
    let isDirty = false;
    const newValues = { ...item.values };

    // Check General Verification Photo
    if (newValues.verification_photo && newValues.verification_photo.startsWith('data:image')) {
      console.log(`Cleaning verification_photo for item ${item.id}`);
      newValues.verification_photo = null;
      newValues.verified = false; // Optional: Reset verification status? Or just remove photo. Let's just remove photo to be safe.
      isDirty = true;
    }

    // Check Daily Execution Photos
    if (newValues.daily_execution) {
      const daily = { ...newValues.daily_execution };
      let dailyDirty = false;

      Object.keys(daily).forEach(dateId => {
        const entry = daily[dateId];
        // Entry can be object { val, done, photo } or simple value
        if (typeof entry === 'object' && entry.photo && entry.photo.startsWith('data:image')) {
           console.log(`Cleaning daily photo for item ${item.id} on ${dateId}`);
           daily[dateId] = { ...entry, photo: null };
           dailyDirty = true;
        }
      });

      if (dailyDirty) {
        newValues.daily_execution = daily;
        isDirty = true;
      }
    }

    // 3. Update if dirty
    if (isDirty) {
      const { error: updateError } = await supabase
        .from('items')
        .update({ values: newValues })
        .eq('id', item.id);
      
      if (updateError) {
        console.error(`Failed to update item ${item.id}`, updateError);
      } else {
        cleanedCount++;
      }
    }
  }

  return { checked: items.length, cleaned: cleanedCount };
};
