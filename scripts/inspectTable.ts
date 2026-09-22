import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectTable() {
  console.log('--- INSPECCIÓN DE COLUMNAS DE weekly_plan_item_executions EN SUPABASE REAL ---');
  const { data, error } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying table:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columnas encontradas en registro existente:', Object.keys(data[0]));
  } else {
    console.log('Tabla vacía o sin registros. Consultando columnas con inserción controlada de prueba o select...');
    console.log('data:', data);
  }
}

inspectTable();
