
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function audit() {
  console.log('--- AUDIT START ---');
  
  // 1. Check for duplicates in financial_acta_details (acta_id, item_id, group_id)
  // Even if there's a constraint, let's see current data.
  const { data: details, error } = await supabase
    .from('financial_acta_details')
    .select('id, acta_id, item_id, group_id, quantity, value');
    
  if (error) {
    console.error('Error fetching details:', error);
    return;
  }
  
  console.log(`Total details entries: ${details.length}`);
  
  const seen = new Set();
  const dupes = [];
  details.forEach(d => {
    const key = `${d.acta_id}|${d.item_id}|${d.group_id}`;
    if (seen.has(key)) {
      dupes.push(d);
    }
    seen.add(key);
  });
  
  if (dupes.length > 0) {
    console.error(`Found ${dupes.length} duplicates!`, dupes);
  } else {
    console.log('No duplicates found based on (acta_id, item_id, group_id).');
  }

  // 2. Check for null values or extreme values
  const suspicious = details.filter(d => d.quantity === null || d.value === null || isNaN(d.quantity) || isNaN(d.value));
  if (suspicious.length > 0) {
    console.log(`Found ${suspicious.length} suspicious entries with NULL or NaN:`, suspicious);
  }

  // 3. Get item names from board (to check for items in acts that don't exist anymore)
  // Since we don't have board_items table (presumably it's in Monday), we can't fully audit without the board context.
  // But we can check if there are entries with same item_id but DIFFERENT group_id in the same ACTA.
  const byItem = {};
  details.forEach(d => {
    if (!byItem[d.item_id]) byItem[d.item_id] = [];
    byItem[d.item_id].push(d);
  });

  console.log('--- AUDIT END ---');
}

audit();
