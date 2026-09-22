/**
 * Activity Execution Report Read Model Service
 * Evidence Layer del Acta (Soporte de Ejecución, Evidencia y Certificados)
 * 
 * Read-only consultativo service. 0 DDL, 0 mutaciones.
 * Consumes existing domain contracts and evidenceCuration.ts.
 */

import { extractCuratedEvidencePair, ExecutionAttachmentItem } from './evidenceCuration';

export interface EvidenceDTO {
  attachment_id: string;
  storage_path: string; // Referencia estable (no Signed URL)
  phase: 'before' | 'after';
  captured_at: string;
  has_gps: boolean;
}

export interface DocumentSupportDTO {
  attachment_id: string;
  file_name: string;
  storage_path: string;
  file_type: string;
  uploaded_at: string;
}

export interface ActivityReportItemDTO {
  execution_id: string;
  activity_key: string;
  activity_name: string;
  unit: string;
  executed_qty: number;
  certified_qty?: number; // Sourced from acta_item_sources.cantidad_consumida (undefined in Modo Período)
  execution_date: string;
  evidence: {
    before: EvidenceDTO[]; // Max 2 items
    after: EvidenceDTO[];  // Max 2 items
  };
  documents?: DocumentSupportDTO[]; // Certificados de disposición final / vertimiento
}

export interface FrontGroupDTO {
  site_id: string;
  site_name: string;
  front_name?: string;
  activities: ActivityReportItemDTO[];
}

export interface ActivityExecutionReportDTO {
  header: {
    contract_number: string;
    project_name: string;
    contractor_name: string;
    interventoria_name: string;
    acta_number?: string;
    issued_at?: string;
    is_draft: boolean;
    is_simulation?: boolean;
    period_start: string;
    period_end: string;
  };
  fronts: FrontGroupDTO[];
  signatories: {
    project_director?: { name: string; title: string };
    interventor?: { name: string; title: string };
  };
}

export type BuildReportParams =
  | { mode: 'acta'; acta_id: string }
  | { mode: 'period'; board_id: string; period_start: string; period_end: string };

/**
 * Helper pure function to filter eligible execution statuses under ADR-0011
 */
export function isEligibleExecutionStatus(statusOrVerificationStatus?: string | null): boolean {
  if (!statusOrVerificationStatus) return false;
  const s = statusOrVerificationStatus.toLowerCase();
  return s === 'verified' || s === 'confirmed' || s === 'closed';
}

/**
 * Pure function to map raw execution attachment to EvidenceDTO
 */
export function mapAttachmentToEvidenceDTO(att: ExecutionAttachmentItem): EvidenceDTO {
  return {
    attachment_id: att.id,
    storage_path: att.storage_path,
    phase: att.phase,
    captured_at: att.captured_at,
    has_gps: !!(att.has_gps || (att.latitude !== undefined && att.longitude !== undefined)),
  };
}

/**
 * Main Read Model builder function.
 * Accepts an injected Supabase client or mock data provider for testability.
 */
export async function buildActivityExecutionReportDTO(
  params: BuildReportParams,
  supabaseClient?: any
): Promise<ActivityExecutionReportDTO> {
  if (!supabaseClient) {
    throw new Error('Supabase client is required for buildActivityExecutionReportDTO');
  }

  if (params.mode === 'acta') {
    // 1. Fetch Acta
    const { data: acta, error: actaErr } = await supabaseClient
      .from('actas')
      .select('id, board_id, numero, estado, fecha, issued_at, created_at')
      .eq('id', params.acta_id)
      .single();

    if (actaErr || !acta) {
      throw new Error(`Acta not found (id: ${params.acta_id})`);
    }

    const boardId = acta.board_id;
    const isDraft = acta.estado === 'draft';
    const issuedAt = acta.issued_at;

    // 2. Fetch Board Metadata
    const { data: board } = await supabaseClient
      .from('boards')
      .select('id, name, settings')
      .eq('id', boardId)
      .single();

    const projectName = board?.name || 'Proyecto de Conservación';
    const contractNumber = board?.settings?.contract_number || 'CONTRATO-038-2023';
    const contractorName = board?.settings?.contractor_name || 'Consorcio Conservación Costera';
    const interventoriaName = board?.settings?.interventoria_name || 'Interventoría Puerta de Oro';

    // 3. Fetch acta_item_sources linked to this acta_id
    const { data: itemSources, error: sourcesErr } = await supabaseClient
      .from('acta_item_sources')
      .select('id, acta_item_id, execution_id, cantidad_consumida, acta_items!inner(acta_id, poa_activity_id)')
      .eq('acta_items.acta_id', params.acta_id);

    if (sourcesErr) {
      throw new Error(`Failed to fetch acta_item_sources: ${sourcesErr.message}`);
    }

    const executionSourcesMap = new Map<string, number>();
    for (const src of itemSources || []) {
      const current = executionSourcesMap.get(src.execution_id) || 0;
      executionSourcesMap.set(src.execution_id, current + Number(src.cantidad_consumida || 0));
    }

    const executionIds = Array.from(executionSourcesMap.keys());
    if (executionIds.length === 0) {
      return {
        header: {
          contract_number: contractNumber,
          project_name: projectName,
          contractor_name: contractorName,
          interventoria_name: interventoriaName,
          acta_number: acta.numero ? String(acta.numero) : undefined,
          issued_at: issuedAt || undefined,
          is_draft: isDraft,
          period_start: acta.fecha || '2026-09-01',
          period_end: acta.fecha || '2026-09-30',
        },
        fronts: [],
        signatories: {},
      };
    }

    // 4. Fetch Executions
    const { data: executions, error: execErr } = await supabaseClient
      .from('weekly_plan_item_executions')
      .select(`
        id,
        weekly_plan_item_id,
        board_id,
        execution_date,
        executed_qty,
        verification_status,
        status,
        weekly_plan_items!inner(
          id,
          name,
          unit,
          activity_key,
          group_id,
          weekly_plans!inner(
            id,
            site_id,
            sites(name)
          ),
          groups(title)
        )
      `)
      .in('id', executionIds);

    if (execErr) {
      throw new Error(`Failed to fetch executions: ${execErr.message}`);
    }

    // Filter eligible executions
    const eligibleExecutions = (executions || []).filter((e: any) =>
      isEligibleExecutionStatus(e.verification_status || e.status)
    );

    // 5. Fetch Attachments for these executions
    const { data: rawAttachments, error: attErr } = await supabaseClient
      .from('execution_attachments')
      .select('id, execution_id, file_name, file_url, file_type, file_size, created_at, phase, file_hash')
      .in('execution_id', executionIds);

    if (attErr) {
      throw new Error(`Failed to fetch attachments: ${attErr.message}`);
    }

    // Filter attachments if ISSUED: created_at <= actas.issued_at
    const attachmentsToProcess = (rawAttachments || []).filter((att: any) => {
      if (!isDraft && issuedAt) {
        return new Date(att.created_at).getTime() <= new Date(issuedAt).getTime();
      }
      return true;
    });

    // Group attachments by execution_id
    const attachmentsByExecMap = new Map<string, ExecutionAttachmentItem[]>();
    const docSupportsByExecMap = new Map<string, DocumentSupportDTO[]>();

    for (const att of attachmentsToProcess) {
      const execId = att.execution_id;
      const isPdf = att.file_type === 'application/pdf' || att.file_name?.endsWith('.pdf');

      if (isPdf) {
        const docs = docSupportsByExecMap.get(execId) || [];
        docs.push({
          attachment_id: att.id,
          file_name: att.file_name,
          storage_path: att.file_url || `execution/${execId}/${att.file_name}`,
          file_type: att.file_type || 'application/pdf',
          uploaded_at: att.created_at,
        });
        docSupportsByExecMap.set(execId, docs);
      } else {
        const list = attachmentsByExecMap.get(execId) || [];
        list.push({
          id: att.id,
          execution_id: att.execution_id,
          storage_path: att.file_url || `execution/${execId}/${att.file_name}`,
          file_hash: att.file_hash || att.id,
          phase: att.phase === 'before' || att.phase === 'after' ? att.phase : 'after',
          captured_at: att.created_at,
        });
        attachmentsByExecMap.set(execId, list);
      }
    }

    // 6. Build Activity Items & Group by Front / Site
    const frontMap = new Map<string, FrontGroupDTO>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    for (const exec of eligibleExecutions) {
      const item = exec.weekly_plan_items;
      const siteName = item?.weekly_plans?.sites?.name || board?.name || 'Sitio Principal';
      const frontName = item?.groups?.title || 'Frente General';
      const frontKey = `${siteName}___${frontName}`;

      if (exec.execution_date) {
        if (exec.execution_date < minDate) minDate = exec.execution_date;
        if (exec.execution_date > maxDate) maxDate = exec.execution_date;
      }

      const execAtts = attachmentsByExecMap.get(exec.id) || [];
      const curatedPair = extractCuratedEvidencePair(execAtts, 2);

      const beforeDTOs = curatedPair.before.map(mapAttachmentToEvidenceDTO);
      const afterDTOs = curatedPair.after.map(mapAttachmentToEvidenceDTO);
      const docsDTOs = docSupportsByExecMap.get(exec.id);

      const activityDTO: ActivityReportItemDTO = {
        execution_id: exec.id,
        activity_key: item?.activity_key || item?.name || 'ACT-001',
        activity_name: item?.name || 'Actividad Ejecutada',
        unit: item?.unit || 'UND',
        executed_qty: Number(exec.executed_qty || 0),
        certified_qty: executionSourcesMap.get(exec.id),
        execution_date: exec.execution_date,
        evidence: {
          before: beforeDTOs,
          after: afterDTOs,
        },
        documents: docsDTOs,
      };

      let frontGroup = frontMap.get(frontKey);
      if (!frontGroup) {
        frontGroup = {
          site_id: item?.weekly_plans?.site_id || boardId,
          site_name: siteName,
          front_name: frontName,
          activities: [],
        };
        frontMap.set(frontKey, frontGroup);
      }
      frontGroup.activities.push(activityDTO);
    }

    // Signatories from board_members
    const { data: members } = await supabaseClient
      .from('board_members')
      .select('role, user_id, users(full_name)')
      .eq('board_id', boardId);

    let directorName: string | undefined;
    let interventorName: string | undefined;

    for (const m of members || []) {
      if (m.role === 'project_director' || m.role === 'owner') {
        directorName = m.users?.full_name || 'Director de Proyecto';
      }
      if (m.role === 'interventor') {
        interventorName = m.users?.full_name || 'Interventor Autorizado';
      }
    }

    return {
      header: {
        contract_number: contractNumber,
        project_name: projectName,
        contractor_name: contractorName,
        interventoria_name: interventoriaName,
        acta_number: acta.numero ? String(acta.numero) : undefined,
        issued_at: issuedAt || undefined,
        is_draft: isDraft,
        period_start: minDate !== '9999-12-31' ? minDate : (acta.fecha || '2026-09-01'),
        period_end: maxDate !== '0000-01-01' ? maxDate : (acta.fecha || '2026-09-30'),
      },
      fronts: Array.from(frontMap.values()),
      signatories: {
        project_director: directorName ? { name: directorName, title: 'Director de Proyecto' } : undefined,
        interventor: interventorName ? { name: interventorName, title: 'Interventor de Obra' } : undefined,
      },
    };
  } else {
    // Mode: 'period'
    const { data: board } = await supabaseClient
      .from('boards')
      .select('id, name, settings')
      .eq('id', params.board_id)
      .single();

    if (!board) {
      throw new Error(`Board not found (id: ${params.board_id})`);
    }

    const projectName = board.name || 'Proyecto de Conservación';
    const contractNumber = board.settings?.contract_number || 'CONTRATO-038-2023';
    const contractorName = board.settings?.contractor_name || 'Consorcio Conservación Costera';
    const interventoriaName = board.settings?.interventoria_name || 'Interventoría Puerta de Oro';

    const { data: executions, error: execErr } = await supabaseClient
      .from('weekly_plan_item_executions')
      .select(`
        id,
        weekly_plan_item_id,
        board_id,
        execution_date,
        executed_qty,
        verification_status,
        status,
        weekly_plan_items!inner(
          id,
          name,
          unit,
          activity_key,
          group_id,
          weekly_plans!inner(
            id,
            site_id,
            sites(name)
          ),
          groups(title)
        )
      `)
      .eq('board_id', params.board_id)
      .gte('execution_date', params.period_start)
      .lte('execution_date', params.period_end);

    if (execErr) {
      throw new Error(`Failed to fetch executions for period: ${execErr.message}`);
    }

    const eligibleExecutions = (executions || []).filter((e: any) =>
      isEligibleExecutionStatus(e.verification_status || e.status)
    );

    const execIds = eligibleExecutions.map((e: any) => e.id);
    let rawAttachments: any[] = [];

    if (execIds.length > 0) {
      const { data: atts } = await supabaseClient
        .from('execution_attachments')
        .select('id, execution_id, file_name, file_url, file_type, file_size, created_at, phase, file_hash')
        .in('execution_id', execIds);
      rawAttachments = atts || [];
    }

    const attachmentsByExecMap = new Map<string, ExecutionAttachmentItem[]>();
    const docSupportsByExecMap = new Map<string, DocumentSupportDTO[]>();

    for (const att of rawAttachments) {
      const execId = att.execution_id;
      const isPdf = att.file_type === 'application/pdf' || att.file_name?.endsWith('.pdf');

      if (isPdf) {
        const docs = docSupportsByExecMap.get(execId) || [];
        docs.push({
          attachment_id: att.id,
          file_name: att.file_name,
          storage_path: att.file_url || `execution/${execId}/${att.file_name}`,
          file_type: att.file_type || 'application/pdf',
          uploaded_at: att.created_at,
        });
        docSupportsByExecMap.set(execId, docs);
      } else {
        const list = attachmentsByExecMap.get(execId) || [];
        list.push({
          id: att.id,
          execution_id: att.execution_id,
          storage_path: att.file_url || `execution/${execId}/${att.file_name}`,
          file_hash: att.file_hash || att.id,
          phase: att.phase === 'before' || att.phase === 'after' ? att.phase : 'after',
          captured_at: att.created_at,
        });
        attachmentsByExecMap.set(execId, list);
      }
    }

    const frontMap = new Map<string, FrontGroupDTO>();

    for (const exec of eligibleExecutions) {
      const item = exec.weekly_plan_items;
      const siteName = item?.weekly_plans?.sites?.name || board.name || 'Sitio Principal';
      const frontName = item?.groups?.title || 'Frente General';
      const frontKey = `${siteName}___${frontName}`;

      const execAtts = attachmentsByExecMap.get(exec.id) || [];
      const curatedPair = extractCuratedEvidencePair(execAtts, 2);

      const beforeDTOs = curatedPair.before.map(mapAttachmentToEvidenceDTO);
      const afterDTOs = curatedPair.after.map(mapAttachmentToEvidenceDTO);
      const docsDTOs = docSupportsByExecMap.get(exec.id);

      const activityDTO: ActivityReportItemDTO = {
        execution_id: exec.id,
        activity_key: item?.activity_key || item?.name || 'ACT-001',
        activity_name: item?.name || 'Actividad Ejecutada',
        unit: item?.unit || 'UND',
        executed_qty: Number(exec.executed_qty || 0),
        certified_qty: undefined, // Explicitly undefined in Period Mode
        execution_date: exec.execution_date,
        evidence: {
          before: beforeDTOs,
          after: afterDTOs,
        },
        documents: docsDTOs,
      };

      let frontGroup = frontMap.get(frontKey);
      if (!frontGroup) {
        frontGroup = {
          site_id: item?.weekly_plans?.site_id || params.board_id,
          site_name: siteName,
          front_name: frontName,
          activities: [],
        };
        frontMap.set(frontKey, frontGroup);
      }
      frontGroup.activities.push(activityDTO);
    }

    return {
      header: {
        contract_number: contractNumber,
        project_name: projectName,
        contractor_name: contractorName,
        interventoria_name: interventoriaName,
        is_draft: true,
        period_start: params.period_start,
        period_end: params.period_end,
      },
      fronts: Array.from(frontMap.values()),
      signatories: {},
    };
  }
}
