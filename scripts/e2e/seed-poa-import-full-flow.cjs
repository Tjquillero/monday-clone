// Siembra (o limpia con --cleanup) un board de prueba con las 9 zonas
// reales del POA como groups, TODOS los mapeos de zona resueltos, y las 19
// actividades ya confirmadas con evidencia real en Tablero Principal
// (docs/discovery/poa-activity-equivalences.md) cargadas en
// board_activity_standards con el mismo rendimiento. A diferencia de
// seed-poa-import-integration.cjs (que deja todo sin resolver a propósito
// para probar el resolver), este seed sirve para probar el camino 'success'
// real del importador — nunca antes cubierto por un E2E.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { createClient } = req('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const seedPath = path.join(os.tmpdir(), 'mantenix-e2e-poa-full-flow-seed.json');

const REAL_ZONE_NAMES = [
  'PLAZA DE PTO COLOMBIA', 'PLAYA MANGLARES', 'SALGAR PLAYAS DEL COUNTRY 1',
  'SALGAR PLAYAS DE SABANAILLA 2', 'PLAYAS DE MIRAMAR SECTOR EL FARO',
  'CENTRO GASTRONOMICO', 'MERCADO LA SAZÓN', 'SENDERO SANTA VERÓNICA',
  'PLAYA PUNTA ASTILLEROS',
];

// Mismos 19 valores confirmados en Tablero Principal (Flujo A + Flujo B),
// leídos textualmente de board_activity_standards real — no retipeados.
const CONFIRMED_ACTIVITIES = [
  { activity_key: '1.01', name: 'SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA MANUAL DE INFRAESTRUCTURA COSTERA', category: 'ZONA DE PLAYA', unit: 'M2', rendimiento: 3000 },
  { activity_key: '1.09', name: 'CORTE DE TRONCOS DE MADERA EN PLAYA (LONG MAX DE 8 m)', category: 'ZONA DE PLAYA', unit: 'UN', rendimiento: 20 },
  { activity_key: '1.10', name: 'TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO', category: 'ZONA DE PLAYA', unit: 'M2', rendimiento: 5000 },
  { activity_key: '1.11', name: 'CARGUE CON MAQUINARIA DE MATERIAL ACOPIADO Y CLASIFICADO EN VOLQUETAS', category: 'ZONA DE PLAYA', unit: 'M2', rendimiento: 6450 },
  { activity_key: '1.14', name: 'SUMINISTRO DE PERSONAL, INSUMOS, HERRAMIENTAS Y EQUIPOS PARA NIVELACIÓN MECÁNICA DE PLAYAS', category: 'ZONA DE PLAYA', unit: 'M2', rendimiento: 18000 },
  { activity_key: '1.15', name: 'SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS', category: 'ZONA DE PLAYA', unit: 'M2', rendimiento: 85000 },
  { activity_key: '2.01', name: 'CONTROL DE MALEZAS MECANICA DE ARBUSTOS Y CUBRESUELOS', category: 'ZONA VERDE', unit: 'M2', rendimiento: 600 },
  { activity_key: '2.06', name: 'SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN CONTROL FITOSANITARIO PARA ARBUSTOS, CUBRESUELOS', category: 'ZONA VERDE', unit: 'M2', rendimiento: 2000 },
  { activity_key: '2.07', name: 'SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN CONTROL FITOSANITARIO DE GRAMA', category: 'ZONA VERDE', unit: 'M2', rendimiento: 2000 },
  { activity_key: '2.08', name: 'SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN CONTROL FITOSANITARIO DE ARBOLES Y PALMAS', category: 'ZONA VERDE', unit: 'UND', rendimiento: 240 },
  { activity_key: '2.09', name: 'SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUBRESUELOS, FERTILIZACIÓN DE SISTESIS ORGANICA', category: 'ZONA VERDE', unit: 'M2', rendimiento: 2500 },
  { activity_key: '2.10', name: 'SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILIZACIÓN DE SISTESIS ORGANICA', category: 'ZONA VERDE', unit: 'M2', rendimiento: 2500 },
  { activity_key: '2.11', name: 'SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICIONAL ARBOLES Y PALMAS, FERTILIZACIÓN DE SISTESIS ORGANICA', category: 'ZONA VERDE', unit: 'UND', rendimiento: 240 },
  { activity_key: '2.12', name: 'SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATIVA DE ARBUSTOS Y CUBRESUELOS', category: 'ZONA VERDE', unit: 'UN', rendimiento: 1200 },
  { activity_key: '2.13', name: 'SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA CON MAQUINA', category: 'ZONA VERDE', unit: 'M2', rendimiento: 5000 },
  { activity_key: '2.14', name: 'SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATICA DE ARBOLES Y PALMAS', category: 'ZONA VERDE', unit: 'UN', rendimiento: 200 },
  { activity_key: '3.03', name: 'SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DURAS', category: 'ZONA DURA', unit: 'M2', rendimiento: 10000 },
  { activity_key: '3.04', name: 'LAVADA A PRESIÓN DE ZONAS DURAS', category: 'ZONA DURA', unit: 'M2', rendimiento: 7000 },
  { activity_key: '3.06', name: 'PULIDO Y ENCERADO DE PISOS DE MARMOL POR MEDIOS MECÁNICOS Y MANUALES', category: 'ZONA DURA', unit: 'M2', rendimiento: 300 },
];

(async () => {
  if (process.argv.includes('--cleanup')) {
    if (fs.existsSync(seedPath)) {
      const { boardId } = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      const { error } = await admin.from('boards').delete().eq('id', boardId);
      console.log(error ? 'cleanup error: ' + error.message : 'Board/poa/groups/catálogo de prueba eliminados');
      fs.unlinkSync(seedPath);
    } else console.log('Sin seed que limpiar');
    return;
  }

  const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
  const anonForLookup = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await anonForLookup.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.user) { console.error('Usuario E2E no existe o credenciales inválidas:', signInErr?.message); process.exit(1); }
  const e2eUser = signIn.user;

  const { data: board, error: bErr } = await admin
    .from('boards')
    .insert({ name: 'Test Board POA Import Full Flow (E2E)', owner_id: e2eUser.id })
    .select('id')
    .single();
  if (bErr) { console.error('board:', bErr.message); process.exit(1); }

  const { error: mErr } = await admin.from('board_members').insert({ board_id: board.id, user_id: e2eUser.id, role: 'admin' });
  if (mErr) { console.error('board_members:', mErr.message); process.exit(1); }

  const { data: groups, error: gErr } = await admin
    .from('groups')
    .insert(REAL_ZONE_NAMES.map((title, i) => ({ board_id: board.id, title, color: '#00FF00', position: i })))
    .select('id, title');
  if (gErr) { console.error('groups:', gErr.message); process.exit(1); }
  const groupIdByZoneName = Object.fromEntries(groups.map((g) => [g.title, g.id]));

  const { data: poa, error: poaErr } = await admin
    .from('poa')
    .upsert({ board_id: board.id, name: 'POA Import Full Flow E2E' }, { onConflict: 'board_id' })
    .select('id')
    .single();
  if (poaErr) { console.error('poa:', poaErr.message); process.exit(1); }

  const zoneMappingRows = REAL_ZONE_NAMES.map((zoneName) => ({
    poa_id: poa.id,
    excel_zone_name: zoneName,
    group_id: groupIdByZoneName[zoneName],
    created_by: e2eUser.id,
  }));
  const { error: zmErr } = await admin.from('poa_zone_mappings').insert(zoneMappingRows);
  if (zmErr) { console.error('poa_zone_mappings:', zmErr.message); process.exit(1); }

  const { error: basErr } = await admin.from('board_activity_standards').insert(
    CONFIRMED_ACTIVITIES.map((a) => ({ ...a, board_id: board.id, group_id: null, priority: 'preferred', source: 'e2e-full-flow-seed' })),
  );
  if (basErr) { console.error('board_activity_standards:', basErr.message); process.exit(1); }

  fs.writeFileSync(seedPath, JSON.stringify({ boardId: board.id, poaId: poa.id }));
  console.log(`OK — board con 9 zonas mapeadas y 19 actividades en el catálogo técnico. poaId=${poa.id} boardId=${board.id}`);
  console.log(`Import: http://localhost:3000/poa/${poa.id}/import`);
})();
