import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools: actividades operativas y linaje contractual
// Responde con el alcance operativo real del board preservando la genealogía:
// POA activo -> poa_activities -> poa_activity_zones -> groups/sites -> weekly_plans -> weekly_plan_items.
//
// Regla congelada: slots con planned_qty = 0 o sin cantidad contratada (contractual_qty = 0)
// NO se presentan como actividades operativas asignadas por defecto (isContractual = false).

export interface OperationalActivityDto {
  activityCode: string;
  activityName: string;
  activityId: string;
  siteId: string;
  siteName: string;
  unit: string;
  unitPrice: number;
  frequency: number;
  contractualQty: number;
  plannedQty: number;
  executedQty: number;
  isOperational: boolean;
  poaVersionId: string;
  weeklyPlanId: string | null;
  weeklyPlanItemId: string | null;
  status: string | null;
}

export interface GetOperationalActivitiesOptions {
  groupId?: string;
  search?: string;
  includeInactive?: boolean;
}

export async function getOperationalActivities(
  supabase: SupabaseClient,
  boardId: string,
  options: GetOperationalActivitiesOptions = {}
): Promise<OperationalActivityDto[]> {
  const { groupId, search, includeInactive = false } = options;

  // 1. Validar autorización de board vía RLS
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('id, name')
    .eq('id', boardId)
    .maybeSingle();

  if (boardError) throw boardError;
  if (!board) {
    throw new Error(`No tiene acceso al board ${boardId} o el board no existe.`);
  }

  // 2. Obtener grupos / sitios del board
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, title, board_id')
    .eq('board_id', boardId);

  if (groupsError) throw groupsError;
  const groupMap = new Map((groups || []).map((g) => [g.id, g.title]));

  // 3. Obtener POA activo del board
  const { data: poaList, error: poaListError } = await supabase
    .from('poa')
    .select('id')
    .eq('board_id', boardId);

  if (poaListError) throw poaListError;
  const poaIds = (poaList || []).map((p) => p.id);

  let activeVersion: { id: string; version_number?: number; status?: string } | null = null;
  if (poaIds.length > 0) {
    const { data: versions, error: versionsError } = await supabase
      .from('poa_versions')
      .select('id, version_number, status')
      .in('poa_id', poaIds)
      .eq('status', 'active')
      .limit(1);

    if (versionsError) throw versionsError;
    if (versions && versions.length > 0) {
      activeVersion = versions[0];
    }
  }

  // Si no hay versión activa del POA, no hay alcance operativo contractual
  if (!activeVersion) {
    return [];
  }

  // 4. Obtener catálogo oficial de nombres desde items (si existen)
  const { data: boardItems } = await supabase
    .from('items')
    .select('id, name, values');

  const itemNameByCode = new Map<string, string>();
  const itemUnitByCode = new Map<string, string>();
  for (const it of boardItems || []) {
    const code = it.values?.code;
    if (code) {
      itemNameByCode.set(String(code), String(it.name));
      if (it.values?.unit) itemUnitByCode.set(String(code), String(it.values.unit));
    }
  }

  // 5. Obtener poa_activities y poa_activity_zones de la versión activa
  const { data: poaActivities, error: actsError } = await supabase
    .from('poa_activities')
    .select('id, activity_key, description, unit, frecuencia, precio_unitario')
    .eq('poa_version_id', activeVersion.id);

  if (actsError) throw actsError;

  const actsList = poaActivities || [];
  const actIds = actsList.map((a) => a.id);
  const zonesByActivityId = new Map<string, Array<{ id: string; zone_id: string; cantidad_contratada: number }>>();

  if (actIds.length > 0) {
    const { data: zones, error: zonesError } = await supabase
      .from('poa_activity_zones')
      .select('id, poa_activity_id, zone_id, cantidad_contratada')
      .in('poa_activity_id', actIds);

    if (zonesError) throw zonesError;

    for (const z of zones || []) {
      const list = zonesByActivityId.get(z.poa_activity_id) || [];
      list.push(z);
      zonesByActivityId.set(z.poa_activity_id, list);
    }
  }

  // 6. Obtener planes semanales más recientes para mapear planned/executed
  const { data: weeklyPlans } = await supabase
    .from('weekly_plans')
    .select('id, board_id, group_id, week_start, status')
    .eq('board_id', boardId)
    .order('week_start', { ascending: false });

  const latestPlansByGroup = new Map<string, { id: string; status: string }>();
  for (const wp of weeklyPlans || []) {
    if (wp.group_id && !latestPlansByGroup.has(wp.group_id)) {
      latestPlansByGroup.set(wp.group_id, { id: wp.id, status: wp.status });
    }
  }

  const planIds = Array.from(new Set(Array.from(latestPlansByGroup.values()).map((p) => p.id)));
  const planItemsByPlanAndKey = new Map<string, { id: string; planned_qty: number; executed_qty: number }>();

  if (planIds.length > 0) {
    const { data: wpis } = await supabase
      .from('weekly_plan_items')
      .select('id, plan_id, activity_key, planned_qty, executed_qty')
      .in('plan_id', planIds);

    for (const wpi of wpis || []) {
      const mapKey = `${wpi.plan_id}:${wpi.activity_key}`;
      planItemsByPlanAndKey.set(mapKey, {
        id: wpi.id,
        planned_qty: Number(wpi.planned_qty || 0),
        executed_qty: Number(wpi.executed_qty || 0),
      });
    }
  }

  // 7. Consolidar actividades operativas con linaje contractual
  const results: OperationalActivityDto[] = [];

  for (const act of actsList) {
    const zones = zonesByActivityId.get(act.id) || [];
    const officialName = itemNameByCode.get(act.activity_key) || act.description || `Actividad ${act.activity_key}`;
    const unit = itemUnitByCode.get(act.activity_key) || act.unit || 'UND';

    for (const z of zones) {
      const siteId = z.zone_id;
      if (!siteId) continue;

      const siteName = groupMap.get(siteId) || 'Sitio sin asignar';
      const contractualQty = Number(z.cantidad_contratada || 0);
      const isOperational = contractualQty > 0;

      const latestPlan = latestPlansByGroup.get(siteId);
      const wpi = latestPlan ? planItemsByPlanAndKey.get(`${latestPlan.id}:${act.activity_key}`) : null;

      const plannedQty = wpi ? Number(wpi.planned_qty || 0) : 0;
      const executedQty = wpi ? Number(wpi.executed_qty || 0) : 0;

      // Filtro de operativas: por defecto solo mostrar aquellas con alcance contractual real
      if (!isOperational && !includeInactive) {
        continue;
      }

      // Filtro por sitio / group_id
      if (groupId && siteId !== groupId) {
        continue;
      }

      // Filtro de búsqueda textual
      if (search) {
        const s = search.toLowerCase();
        const matchesCode = act.activity_key.toLowerCase().includes(s);
        const matchesName = officialName.toLowerCase().includes(s);
        const matchesSite = siteName.toLowerCase().includes(s);
        if (!matchesCode && !matchesName && !matchesSite) {
          continue;
        }
      }

      results.push({
        activityCode: act.activity_key,
        activityName: officialName,
        activityId: act.id,
        siteId,
        siteName,
        unit,
        unitPrice: Number(act.precio_unitario || 0),
        frequency: Number(act.frecuencia || 1),
        contractualQty,
        plannedQty,
        executedQty,
        isOperational,
        poaVersionId: activeVersion.id,
        weeklyPlanId: latestPlan?.id || null,
        weeklyPlanItemId: wpi?.id || null,
        status: latestPlan?.status || null,
      });
    }
  }

  // Ordenamiento determinístico: código de actividad natural (2.1, 2.2, 2.19) y luego nombre de sitio
  results.sort((a, b) => {
    const keyCmp = a.activityCode.localeCompare(b.activityCode, undefined, { numeric: true });
    if (keyCmp !== 0) return keyCmp;
    return a.siteName.localeCompare(b.siteName);
  });

  return results;
}
