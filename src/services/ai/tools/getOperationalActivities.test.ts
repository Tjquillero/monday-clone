jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
  createPartFromUri: jest.fn(),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
}));

import { getOperationalActivitiesTool } from './getOperationalActivities';
import { getOperationalActivities } from '../domainTools/operationalActivities';
import { AI_TOOL_REGISTRY, getToolDefinition, listToolDeclarations } from './registry';
import { TOOL_DISPLAY_NAMES, getToolDisplayName } from './displayNames';

function mockSupabase(responses: {
  boards?: { data: any; error: any };
  groups?: { data: any; error: any };
  poa?: { data: any; error: any };
  poa_versions?: { data: any; error: any };
  items?: { data: any; error: any };
  poa_activities?: { data: any; error: any };
  poa_activity_zones?: { data: any; error: any };
  weekly_plans?: { data: any; error: any };
  weekly_plan_items?: { data: any; error: any };
}) {
  return {
    from: jest.fn((table: string) => {
      const state: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockImplementation(() => {
          if (table === 'boards') return Promise.resolve(responses.boards ?? { data: { id: 'board-1', name: 'Tablero Principal' }, error: null });
          if (table === 'poa') return Promise.resolve(responses.poa ?? { data: [{ id: 'poa-1' }], error: null });
          return Promise.resolve({ data: null, error: null });
        }),
      };

      // Manejo de promesas directas para .select().eq() / .in()
      state.then = (resolve: any) => {
        if (table === 'boards') resolve(responses.boards ?? { data: [{ id: 'board-1', name: 'Tablero Principal' }], error: null });
        else if (table === 'groups') resolve(responses.groups ?? { data: [], error: null });
        else if (table === 'poa') resolve(responses.poa ?? { data: [{ id: 'poa-1' }], error: null });
        else if (table === 'poa_versions') resolve(responses.poa_versions ?? { data: [{ id: 'pv-active', status: 'active' }], error: null });
        else if (table === 'items') resolve(responses.items ?? { data: [], error: null });
        else if (table === 'poa_activities') resolve(responses.poa_activities ?? { data: [], error: null });
        else if (table === 'poa_activity_zones') resolve(responses.poa_activity_zones ?? { data: [], error: null });
        else if (table === 'weekly_plans') resolve(responses.weekly_plans ?? { data: [], error: null });
        else if (table === 'weekly_plan_items') resolve(responses.weekly_plan_items ?? { data: [], error: null });
        else resolve({ data: [], error: null });
      };

      return state;
    }),
  } as any;
}

describe('get_operational_activities (B1 Tool Contract & Implementation)', () => {
  const BOARD_ID = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
  const GROUP_CENTRO_GASTRONOMICO = 'e45851b6-73f7-46ad-b6dd-ea4f5920d747';
  const GROUP_PLAZA_PUERTO_COLOMBIA = '98153f4c-18b9-4bff-abda-39d62db8a931';

  const mockGroups = [
    { id: GROUP_CENTRO_GASTRONOMICO, title: 'CENTRO GASTRONÓMICO', board_id: BOARD_ID },
    { id: GROUP_PLAZA_PUERTO_COLOMBIA, title: 'PLAZA PUERTO COLOMBIA', board_id: BOARD_ID },
  ];

  const mockCatalogItems = [
    { id: 'item-1', name: 'Mantenimiento de muro vertical vegetal', values: { code: '2.19', unit: 'M2-MES' } },
    { id: 'item-2', name: 'Mantenimiento preventivo muro vertical', values: { code: '2.20', unit: 'M2-MES' } },
    { id: 'item-3', name: 'Riego automatizado muro vertical', values: { code: '2.21', unit: 'M2-MES' } },
    { id: 'item-4', name: 'Poda y fertilización muro vertical', values: { code: '2.22', unit: 'M2-MES' } },
    { id: 'item-5', name: 'Limpieza de áreas públicas', values: { code: '1.01', unit: 'M2' } },
  ];

  // En la versión activa del POA solo están 2.19, 2.21, 2.22 (2.20 es histórica y no está en la versión activa)
  const mockPoaActivities = [
    { id: 'act-219', poa_version_id: 'pv-active', activity_key: '2.19', frecuencia: 4, precio_unitario: 50000 },
    { id: 'act-221', poa_version_id: 'pv-active', activity_key: '2.21', frecuencia: 4, precio_unitario: 35000 },
    { id: 'act-222', poa_version_id: 'pv-active', activity_key: '2.22', frecuencia: 2, precio_unitario: 40000 },
    { id: 'act-101', poa_version_id: 'pv-active', activity_key: '1.01', frecuencia: 4, precio_unitario: 15000 },
  ];

  // Cobertura por zonas en el POA activo:
  // - 2.19: asignado a Centro Gastronómico con 153 M2, y a Plaza Puerto Colombia con 0 M2 (sin alcance)
  // - 2.21: asignado a Centro Gastronómico con 153 M2
  // - 2.22: asignado a Centro Gastronómico con 153 M2
  // - 1.01: asignado a Plaza Puerto Colombia con 500 M2
  const mockPoaActivityZones = [
    { id: 'paz-219-cg', poa_activity_id: 'act-219', zone_id: GROUP_CENTRO_GASTRONOMICO, cantidad_contratada: 153 },
    { id: 'paz-219-ppc', poa_activity_id: 'act-219', zone_id: GROUP_PLAZA_PUERTO_COLOMBIA, cantidad_contratada: 0 },
    { id: 'paz-221-cg', poa_activity_id: 'act-221', zone_id: GROUP_CENTRO_GASTRONOMICO, cantidad_contratada: 153 },
    { id: 'paz-222-cg', poa_activity_id: 'act-222', zone_id: GROUP_CENTRO_GASTRONOMICO, cantidad_contratada: 153 },
    { id: 'paz-101-ppc', poa_activity_id: 'act-101', zone_id: GROUP_PLAZA_PUERTO_COLOMBIA, cantidad_contratada: 500 },
  ];

  const mockWeeklyPlans = [
    { id: 'wp-cg', board_id: BOARD_ID, group_id: GROUP_CENTRO_GASTRONOMICO, week_start: '2026-09-21', status: 'published' },
    { id: 'wp-ppc', board_id: BOARD_ID, group_id: GROUP_PLAZA_PUERTO_COLOMBIA, week_start: '2026-09-21', status: 'published' },
  ];

  // En weekly_plan_items se materializaron slots:
  // - 2.19 en CG: planned_qty = 153
  // - 2.19 en PPC: planned_qty = 0 (slot sin demanda materializado)
  const mockWeeklyPlanItems = [
    { id: 'wpi-219-cg', plan_id: 'wp-cg', activity_key: '2.19', planned_qty: 153, executed_qty: 153, status: 'completed' },
    { id: 'wpi-219-ppc', plan_id: 'wp-ppc', activity_key: '2.19', planned_qty: 0, executed_qty: 0, status: 'planned' },
    { id: 'wpi-101-ppc', plan_id: 'wp-ppc', activity_key: '1.01', planned_qty: 500, executed_qty: 250, status: 'in_progress' },
  ];

  function createStandardMockSupabase() {
    return mockSupabase({
      boards: { data: { id: BOARD_ID, name: 'Tablero Principal' }, error: null },
      groups: { data: mockGroups, error: null },
      poa: { data: [{ id: 'poa-1' }], error: null },
      poa_versions: { data: [{ id: 'pv-active', version_number: 1, status: 'active' }], error: null },
      items: { data: mockCatalogItems, error: null },
      poa_activities: { data: mockPoaActivities, error: null },
      poa_activity_zones: { data: mockPoaActivityZones, error: null },
      weekly_plans: { data: mockWeeklyPlans, error: null },
      weekly_plan_items: { data: mockWeeklyPlanItems, error: null },
    });
  }

  // B1-G01: Contrato de herramienta definido
  it('B1-G01: Define correctamente el contrato y schema de la herramienta', () => {
    expect(getOperationalActivitiesTool.name).toBe('get_operational_activities');
    expect(getOperationalActivitiesTool.sideEffects).toBe(false);
    expect(getOperationalActivitiesTool.requiresConfirmation).toBe(false);
    expect(getOperationalActivitiesTool.parametersJsonSchema.required).toContain('board_id');
    expect(getOperationalActivitiesTool.parametersJsonSchema.properties.board_id).toBeDefined();
    expect(getOperationalActivitiesTool.parametersJsonSchema.properties.group_id).toBeDefined();
    expect(getOperationalActivitiesTool.parametersJsonSchema.properties.search).toBeDefined();
    expect(getOperationalActivitiesTool.parametersJsonSchema.properties.include_inactive).toBeDefined();
  });

  // B1-G02: Linaje contractual POA -> poa_activities -> poa_activity_zones -> weekly_plans -> weekly_plan_items
  it('B1-G02: Preserva el linaje contractual completo y devuelve DTOs estructurados', async () => {
    const supabase = createStandardMockSupabase();
    const result = await getOperationalActivities(supabase, BOARD_ID);

    expect(result.length).toBeGreaterThan(0);
    const item219 = result.find((r) => r.activityCode === '2.19');
    expect(item219).toBeDefined();
    expect(item219).toMatchObject({
      activityCode: '2.19',
      activityName: 'Mantenimiento de muro vertical vegetal',
      siteId: GROUP_CENTRO_GASTRONOMICO,
      siteName: 'CENTRO GASTRONÓMICO',
      unit: 'M2-MES',
      unitPrice: 50000,
      frequency: 4,
      contractualQty: 153,
      plannedQty: 153,
      executedQty: 153,
      isOperational: true,
      poaVersionId: 'pv-active',
      weeklyPlanId: 'wp-cg',
      weeklyPlanItemId: 'wpi-219-cg',
      status: 'published',
    });
  });

  // B1-G03: planned_qty = 0 o sin demanda NO se presenta como actividad operativa
  it('B1-G03: Excluye por defecto slots con planned_qty = 0 o sin cantidad contratada', async () => {
    const supabase = createStandardMockSupabase();
    const result = await getOperationalActivities(supabase, BOARD_ID);

    // Todos los registros devueltos por defecto deben tener isOperational = true y contractualQty > 0
    for (const r of result) {
      expect(r.isOperational).toBe(true);
      expect(r.contractualQty).toBeGreaterThan(0);
    }
  });

  // B1-G04: Caso canónico Centro Gastronómico / 2.19 -> 153 M2 (Operativa)
  it('B1-G04: Clasifica Centro Gastronómico / 2.19 como actividad operativa con 153 m²', async () => {
    const supabase = createStandardMockSupabase();
    const result = await getOperationalActivities(supabase, BOARD_ID, {
      groupId: GROUP_CENTRO_GASTRONOMICO,
      search: '2.19',
    });

    expect(result).toHaveLength(1);
    expect(result[0].activityCode).toBe('2.19');
    expect(result[0].siteName).toBe('CENTRO GASTRONÓMICO');
    expect(result[0].contractualQty).toBe(153);
    expect(result[0].plannedQty).toBe(153);
    expect(result[0].isOperational).toBe(true);
  });

  // B1-G05: Caso canónico Plaza Puerto Colombia / 2.19 -> Excluida (No operativa)
  it('B1-G05: Excluye 2.19 de Plaza Puerto Colombia por defecto y la clasifica como no operativa si se solicitan inactivas', async () => {
    const supabase = createStandardMockSupabase();

    // Sin includeInactive: resultado vacío para 2.19 en PPC
    const resultDefault = await getOperationalActivities(supabase, BOARD_ID, {
      groupId: GROUP_PLAZA_PUERTO_COLOMBIA,
      search: '2.19',
    });
    expect(resultDefault).toHaveLength(0);

    // Con includeInactive = true: aparece marcada con isOperational = false y contractualQty = 0
    const resultWithInactive = await getOperationalActivities(supabase, BOARD_ID, {
      groupId: GROUP_PLAZA_PUERTO_COLOMBIA,
      search: '2.19',
      includeInactive: true,
    });
    expect(resultWithInactive).toHaveLength(1);
    expect(resultWithInactive[0].activityCode).toBe('2.19');
    expect(resultWithInactive[0].siteName).toBe('PLAZA PUERTO COLOMBIA');
    expect(resultWithInactive[0].contractualQty).toBe(0);
    expect(resultWithInactive[0].plannedQty).toBe(0);
    expect(resultWithInactive[0].isOperational).toBe(false);
  });

  // B1-G06: Actividad histórica 2.20 -> No aparece como actividad operativa actual
  it('B1-G06: No incluye actividad histórica 2.20 en el alcance operativo actual por no estar en POA activo', async () => {
    const supabase = createStandardMockSupabase();
    const result = await getOperationalActivities(supabase, BOARD_ID, {
      search: '2.20',
    });

    expect(result).toHaveLength(0);
  });

  // B1-G07 & B1-G08: Verificación RLS / Autorización por Board
  it('B1-G07 & B1-G08: Rechaza la consulta si el usuario no tiene acceso al board', async () => {
    const unauthorizedSupabase = mockSupabase({
      boards: { data: null, error: { message: 'JWT expired or unauthorized' } },
    });

    await expect(
      getOperationalActivities(unauthorizedSupabase, 'unauthorized-board-id')
    ).rejects.toBeDefined();
  });

  // B1-G09: Herramienta disponible en AI_TOOL_REGISTRY y listToolDeclarations
  it('B1-G09: Registra get_operational_activities en la whitelist del AI_TOOL_REGISTRY', () => {
    expect(AI_TOOL_REGISTRY['get_operational_activities']).toBeDefined();
    expect(getToolDefinition('get_operational_activities')).toBeDefined();

    const declarations = listToolDeclarations();
    const decl = declarations.find((d) => d.name === 'get_operational_activities');
    expect(decl).toBeDefined();
    expect(decl?.description).toContain('alcance contractual operativo real');
  });

  // Presentation Display Name
  it('Presenta un rótulo amigable en TOOL_DISPLAY_NAMES', () => {
    expect(TOOL_DISPLAY_NAMES['get_operational_activities']).toBe('Actividades operativas y alcance contractual');
    expect(getToolDisplayName('get_operational_activities')).toBe('Actividades operativas y alcance contractual');
  });

  // B1-G10: Ejecución desde el wrapper getOperationalActivitiesTool
  it('B1-G10: Ejecuta exitosamente a través del wrapper getOperationalActivitiesTool.execute', async () => {
    const supabase = createStandardMockSupabase();
    const res = await getOperationalActivitiesTool.execute(supabase, {
      board_id: BOARD_ID,
      search: 'muro',
    });

    // Muro vertical en Centro Gastronómico tiene 2.19, 2.21, 2.22
    expect(res).toHaveLength(3);
    expect(res.map((r) => r.activityCode)).toEqual(['2.19', '2.21', '2.22']);
    for (const r of res) {
      expect(r.siteName).toBe('CENTRO GASTRONÓMICO');
      expect(r.contractualQty).toBe(153);
      expect(r.isOperational).toBe(true);
    }
  });
});
