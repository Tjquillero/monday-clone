
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load env
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../.env.local')));

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fixActaName() {
  console.log('Searching for Acta 323...');
  
  const { data: actas, error: searchError } = await supabase
    .from('financial_actas')
    .select('*')
    .ilike('name', '%Acta 323%');

  if (searchError) {
    console.error('Error searching:', searchError);
    return;
  }

  if (!actas || actas.length === 0) {
    console.log('Acta 323 not found. It might have been fixed already.');
    return;
  }

  const actaToFix = actas[0];
  console.log(`Found Acta: ${actaToFix.name} (${actaToFix.id})`);

  const { error: updateError } = await supabase
    .from('financial_actas')
    .update({ name: 'Acta 32' })
    .eq('id', actaToFix.id);

  if (updateError) {
    console.error('Error updating:', updateError);
  } else {
    console.log('Successfully updated to Acta 32');
  }
}

fixActaName();
