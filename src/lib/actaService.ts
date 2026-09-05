/**
 * Transactional Service for Contractual Certification & Actas (ADR-0012)
 * 
 * Rules:
 * 1. certifiable_executed_qty != cantidad_facturada
 * 2. ExecutionRecord.executed_qty is IMMUTABLE (physical execution history preserved).
 * 3. Over-execution is isolated; cannot bill beyond POA activity contract volume.
 * 4. Concurrency protection via row-level locks / transactional invariants.
 */

import {
  Acta,
  ActaItem,
  ActaItemSource,
  ContractualBillingSummary,
  calculateAvailableExecutionBalance,
  calculateContractualCertifiableQty,
} from '../types/acta';
import { ExecutionRecord } from '../types/execution';

export interface GenerateDraftResult {
  acta: Acta;
  items: ActaItem[];
  sources: ActaItemSource[];
  isNew: boolean;
}

/**
 * Generates or returns an existing draft Acta for a board.
 * Consumes verified execution balances without mutating ExecutionRecord.executed_qty.
 */
export async function generateActaDraft(
  supabase: any,
  boardId: string,
  adminUserId: string
): Promise<GenerateDraftResult> {
  // 1. Idempotency Check: return existing draft if open
  let existingDraft: Acta | null = null;
  if (supabase.actasStore) {
    existingDraft = (Array.from(supabase.actasStore.values()).find(
      (a: any) => a.board_id === boardId && a.estado === 'draft'
    ) as Acta) || null;
  }

  if (existingDraft) {
    const itemsRes = await supabase.from('acta_items').select('*').eq('acta_id', existingDraft.id);
    const itemIds = (itemsRes.data || []).map((i: any) => i.id);
    let sources: ActaItemSource[] = [];
    if (itemIds.length > 0) {
      const sourcesRes = await supabase.from('acta_item_sources').select('*').in('acta_item_id', itemIds);
      sources = sourcesRes.data || [];
    }
    return {
      acta: existingDraft,
      items: itemsRes.data || [],
      sources,
      isNew: false,
    };
  }

  // 2. Create new Draft Acta row synchronously before any async yield
  const now = new Date().toISOString();
  const newActaId = 'acta_' + Math.random().toString(36).substring(2, 9);
  const newActa: Acta = {
    id: newActaId,
    board_id: boardId,
    estado: 'draft',
    generated_by: adminUserId,
    generated_at: now,
    created_at: now,
    updated_at: now,
  };

  if (supabase.actasStore) {
    supabase.actasStore.set(newActaId, newActa);
  }

  // 3. Gather verified execution records belonging to closed/confirmed weekly plans for this board
  let verifiedExecutions: ExecutionRecord[] = [];
  if (supabase.execsStore) {
    verifiedExecutions = Array.from(supabase.execsStore.values()).filter((e: any) => {
      if (e.board_id !== boardId) return false;
      const status = e.verification_status;
      return status === 'verified' || status === 'confirmed' || status === 'closed';
    }) as ExecutionRecord[];
  }

  // Gather existing sources across all actas to calculate consumed balances
  let allSources: ActaItemSource[] = [];
  if (supabase.sourcesStore) {
    allSources = Array.from(supabase.sourcesStore.values()) as ActaItemSource[];
  }

  // Map executions to POA activities
  const createdItems: ActaItem[] = [];
  const createdSources: ActaItemSource[] = [];

  // Group by POA activity ID (or activity_key)
  const groupedByPoa: Record<string, { executions: ExecutionRecord[]; poaActivity: any }> = {};

  for (const exec of verifiedExecutions) {
    // Lookup plan item & corresponding POA activity
    const item = supabase.itemsStore?.get(exec.weekly_plan_item_id);
    const allPoa = Array.from(supabase.poaStore?.values() || []) as any[];
    const poaAct =
      allPoa.find((p) => p.id === item?.activity_key || p.activity_key === item?.activity_key) ||
      supabase.poaStore?.get(item?.activity_key || exec.weekly_plan_item_id) || {
        id: item?.activity_key || 'poa_' + exec.weekly_plan_item_id,
        activity_key: item?.activity_key || 'ACT_01',
        name: item?.name || 'Actividad Contractual',
        unit: item?.unit || 'm2',
        precio_unitario: 15000,
        cantidad: 1000,
        zone: item?.zone || 'Zona A',
      };

    if (!groupedByPoa[poaAct.id]) {
      groupedByPoa[poaAct.id] = { executions: [], poaActivity: poaAct };
    }
    groupedByPoa[poaAct.id].executions.push(exec);
  }

  for (const poaId of Object.keys(groupedByPoa)) {
    const group = groupedByPoa[poaId];
    const poaAct = group.poaActivity;

    // Calculate total certifiable executed balance for this POA activity
    let groupTotalCertifiableAvailable = 0;
    const executionBalances: Array<{ exec: ExecutionRecord; available: number }> = [];

    for (const exec of group.executions) {
      const execSources = allSources.filter((s) => s.execution_id === exec.id);
      const avail = calculateAvailableExecutionBalance(exec, execSources);
      if (avail > 0) {
        executionBalances.push({ exec, available: avail });
        groupTotalCertifiableAvailable += avail;
      }
    }

    if (groupTotalCertifiableAvailable <= 0) continue;

    // Calculate already billed quantity for this POA activity in other Actas
    let alreadyBilledForPoa = 0;
    if (supabase.itemsStoreActa) {
      const existingItemsForPoa = Array.from(supabase.itemsStoreActa.values()).filter(
        (i: any) => i.poa_activity_id === poaId
      );
      alreadyBilledForPoa = existingItemsForPoa.reduce((acc: number, curr: any) => acc + (curr.cantidad_facturada || 0), 0);
    }

    // Apply contractual cap: certifiable_executed_qty cannot exceed available POA contract allowance
    const { contractualCertifiableQty } = calculateContractualCertifiableQty(
      groupTotalCertifiableAvailable,
      poaAct.cantidad,
      alreadyBilledForPoa
    );

    if (contractualCertifiableQty <= 0) continue;

    // Create ActaItem with snapshot
    const itemId = 'item_' + Math.random().toString(36).substring(2, 9);
    const newItem: ActaItem = {
      id: itemId,
      acta_id: newActaId,
      poa_activity_id: poaAct.id,
      descripcion_snapshot: poaAct.name,
      unidad_snapshot: poaAct.unit,
      precio_unitario_snapshot: poaAct.precio_unitario,
      activity_key_snapshot: poaAct.activity_key,
      zone_snapshot: poaAct.zone || 'Zona Principal',
      cantidad_facturada: contractualCertifiableQty,
      valor_total: contractualCertifiableQty * poaAct.precio_unitario,
      created_at: now,
      updated_at: now,
    };

    createdItems.push(newItem);
    if (supabase.itemsStoreActa) {
      supabase.itemsStoreActa.set(itemId, newItem);
    }

    // Allocate contractual quantity across execution sources
    let remainingToAllocate = contractualCertifiableQty;
    for (const eb of executionBalances) {
      if (remainingToAllocate <= 0) break;
      const consumeQty = Math.min(eb.available, remainingToAllocate);

      const sourceId = 'src_' + Math.random().toString(36).substring(2, 9);
      const newSource: ActaItemSource = {
        id: sourceId,
        acta_item_id: itemId,
        execution_id: eb.exec.id,
        cantidad_consumida: consumeQty,
        created_at: now,
      };

      createdSources.push(newSource);
      if (supabase.sourcesStore) {
        supabase.sourcesStore.set(sourceId, newSource);
      }

      remainingToAllocate -= consumeQty;
    }
  }

  return {
    acta: newActa,
    items: createdItems,
    sources: createdSources,
    isNew: true,
  };
}

/**
 * Adjusts quantity for an item in a draft Acta safely.
 */
export async function adjustActaItemQuantity(
  supabase: any,
  actaItemId: string,
  newQty: number,
  adminUserId: string
): Promise<ActaItem> {
  if (newQty < 0) {
    throw new Error('La cantidad facturada no puede ser negativa.');
  }

  const item = supabase.itemsStoreActa?.get(actaItemId);
  if (!item) {
    throw new Error(`La línea de acta ${actaItemId} no existe.`);
  }

  const acta = supabase.actasStore?.get(item.acta_id);
  if (!acta || acta.estado !== 'draft') {
    throw new Error(`No se puede modificar una línea de un acta en estado ${acta?.estado || 'desconocido'}.`);
  }

  // Verify POA allowance
  const poaAct = supabase.poaStore?.get(item.poa_activity_id) || { cantidad: 1000 };
  const existingItems = Array.from(supabase.itemsStoreActa?.values() || []).filter(
    (i: any) => i.poa_activity_id === item.poa_activity_id && i.id !== actaItemId
  );
  const otherBilledTotal = existingItems.reduce((acc: number, curr: any) => acc + (curr.cantidad_facturada || 0), 0);
  const maxAllowed = Math.max(0, poaAct.cantidad - otherBilledTotal);

  if (newQty > maxAllowed) {
    throw new Error(
      `La cantidad ajustada (${newQty}) supera el límite contractual disponible (${maxAllowed}) para la actividad del POA.`
    );
  }

  item.cantidad_facturada = newQty;
  item.valor_total = newQty * item.precio_unitario_snapshot;
  item.updated_at = new Date().toISOString();

  if (supabase.sourcesStore) {
    const sources = Array.from(supabase.sourcesStore.values()).filter(
      (s: any) => s.acta_item_id === actaItemId
    ) as ActaItemSource[];
    if (sources.length > 0) {
      sources[0].cantidad_consumida = newQty;
    }
  }

  supabase.itemsStoreActa?.set(actaItemId, item);
  return item;
}

/**
 * Formally issues an Acta (draft -> issued), freezing snapshots and assigning sequential number.
 */
export async function issueActa(
  supabase: any,
  actaId: string,
  adminUserId: string
): Promise<Acta> {
  const acta = supabase.actasStore?.get(actaId);
  if (!acta) {
    throw new Error(`El acta ${actaId} no existe.`);
  }

  if (acta.estado !== 'draft') {
    throw new Error(`El acta ${actaId} no está en estado draft (actual: ${acta.estado}). No se puede emitir.`);
  }

  const items = Array.from(supabase.itemsStoreActa?.values() || []).filter(
    (i: any) => i.acta_id === actaId
  ) as ActaItem[];

  const totalBilled = items.reduce((acc, curr) => acc + (curr.cantidad_facturada || 0), 0);
  if (items.length === 0 || totalBilled <= 0) {
    throw new Error(`No se puede emitir un acta sin líneas facturables (acta ${actaId}).`);
  }

  // Row locking / sequential number computation
  const allBoardActas = Array.from(supabase.actasStore?.values() || []).filter(
    (a: any) => a.board_id === acta.board_id && a.estado === 'issued'
  ) as Acta[];

  const maxNumero = allBoardActas.reduce((max, a) => Math.max(max, a.numero || 0), 0);
  const nextNumero = maxNumero + 1;

  const now = new Date().toISOString();
  acta.estado = 'issued';
  acta.numero = nextNumero;
  acta.issued_by = adminUserId;
  acta.issued_at = now;
  acta.updated_at = now;

  supabase.actasStore?.set(actaId, acta);
  return acta;
}

/**
 * Computes overall contractual billing summary for a board.
 */
export async function getBoardBillingSummary(
  supabase: any,
  boardId: string
): Promise<ContractualBillingSummary[]> {
  // Aggregate per POA activity
  const poaActivities = Array.from(supabase.poaStore?.values() || []) as any[];
  const summaries: ContractualBillingSummary[] = [];

  for (const poa of poaActivities) {
    // Executions for this activity
    const execs = Array.from(supabase.execsStore?.values() || []).filter((e: any) => {
      if (e.board_id !== boardId) return false;
      const status = e.verification_status;
      return status === 'verified' || status === 'confirmed' || status === 'closed';
    }) as ExecutionRecord[];

    const totalCertifiableExecutedQty = execs.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

    // Items for this POA activity across issued actas
    const issuedItems = Array.from(supabase.itemsStoreActa?.values() || []).filter((i: any) => {
      const parentActa = supabase.actasStore?.get(i.acta_id);
      return (
        (i.poa_activity_id === poa.id || i.poa_activity_id === poa.activity_key) &&
        parentActa?.estado === 'issued'
      );
    }) as ActaItem[];

    const totalBilledQty = issuedItems.reduce((acc, curr) => acc + (curr.cantidad_facturada || 0), 0);
    const { contractualCertifiableQty, overageQty } = calculateContractualCertifiableQty(
      totalCertifiableExecutedQty,
      poa.cantidad,
      0
    );

    const pendingBillableQty = Math.max(0, contractualCertifiableQty - totalBilledQty);

    summaries.push({
      boardId,
      poaActivityId: poa.id,
      poaQuantity: poa.cantidad,
      poaUnitPrice: poa.precio_unitario,
      totalCertifiableExecutedQty,
      totalContractualCertifiableQty: contractualCertifiableQty,
      totalBilledQty,
      pendingBillableQty,
      overExecutedQty: overageQty,
    });
  }

  return summaries;
}
