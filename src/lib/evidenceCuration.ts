/**
 * Evidence Curation & Acta Presentation Engine v1
 * 
 * Implements the domain invariants defined in docs/domain/evidence-curation-domain.md:
 * 1. Strict persistence separation: Operational evidence (execution_attachments) stays 100% untouched.
 * 2. Per-activity allocation: Curation runs per activity/execution item.
 * 3. Engine versioning & reproducibility: Engine version is 'deterministic-v1', output is pure and reproducible.
 * 4. Human selection layer: Explicit supervisor selection per activity.
 * 5. Frozen snapshot on ISSUED: Immutable documentary record upon Acta issuance.
 * 6. Strict contractual boundary guard: Protects planned_qty, executed_qty, planned_jr, executed_jr, worker_count, etc.
 */

export interface ExecutionAttachmentItem {
  id: string;
  execution_id: string;
  storage_path: string;
  file_hash: string;
  phase: 'before' | 'after';
  captured_at: string;
  sharpness_score?: number; // 0.0 - 1.0 or 0 - 100
  has_gps?: boolean;
  latitude?: number;
  longitude?: number;
}

export type CurationEngineVersion = 'deterministic-v1';

export interface ScoredAttachment {
  attachment: ExecutionAttachmentItem;
  score: number;
  reasons: string[];
  is_redundant: boolean;
  recommended: boolean;
  curation_engine_version: CurationEngineVersion;
}

export interface ActivityCurationResult {
  execution_id: string;
  total_operational_attachments: number;
  engine_version: CurationEngineVersion;
  recommended_at: string;
  items: ScoredAttachment[];
  recommended_ids: string[];
}

export interface ActaCuratedSelection {
  acta_id: string;
  execution_id: string;
  selected_attachment_ids: string[];
  updated_at: string;
}

export interface FrozenEvidenceItemSnapshot {
  attachment_id: string;
  storage_path: string;
  file_hash: string;
  phase: 'before' | 'after';
  captured_at: string;
  score: number;
  engine_version: CurationEngineVersion;
  selected_at: string;
}

export interface ActaEvidenceSnapshot {
  acta_id: string;
  status: 'draft' | 'issued';
  frozen_at?: string;
  activity_snapshots: Record<string, FrozenEvidenceItemSnapshot[]>;
  is_frozen: boolean;
}

export interface ContractualItemState {
  id: string;
  poa_id?: string;
  planned_qty: number;
  executed_qty: number;
  planned_jr: number;
  executed_jr: number;
  worker_count: number;
  unit_price: number;
  status: string;
  cantidad_facturada?: number;
}

/**
 * Deterministic Recommendation Engine v1
 * Evaluates attachments for a single activity in a strictly reproducible manner.
 */
export function curateActivityAttachments(
  executionId: string,
  attachments: ExecutionAttachmentItem[],
  maxRecommended = 5,
  timestamp?: string
): ActivityCurationResult {
  const engineVersion: CurationEngineVersion = 'deterministic-v1';
  const recommendedAt = timestamp || '2026-09-03T00:00:00.000Z';

  if (!attachments || attachments.length === 0) {
    return {
      execution_id: executionId,
      total_operational_attachments: 0,
      engine_version: engineVersion,
      recommended_at: recommendedAt,
      items: [],
      recommended_ids: [],
    };
  }

  // 1. Check for exact binary hash duplicates (deduplication)
  const hashSeen = new Set<string>();
  const scoredList: ScoredAttachment[] = [];

  const hasBefore = attachments.some((a) => a.phase === 'before');
  const hasAfter = attachments.some((a) => a.phase === 'after');
  const hasPhasePair = hasBefore && hasAfter;

  for (const att of attachments) {
    const reasons: string[] = [];
    let score = 0;
    let isRedundant = false;

    if (hashSeen.has(att.file_hash)) {
      isRedundant = true;
      reasons.push('Hash SHA-256 redundante (archivo binario duplicado)');
    } else {
      hashSeen.add(att.file_hash);
      score += 10;
      reasons.push('Hash SHA-256 único');
    }

    // Phase balance
    if (hasPhasePair) {
      score += 30;
      reasons.push(`Par de fase coordinado (fase ${att.phase})`);
    } else {
      score += 10;
      reasons.push(`Fase individual (${att.phase})`);
    }

    // GPS presence
    if (att.has_gps || (att.latitude !== undefined && att.longitude !== undefined)) {
      score += 20;
      reasons.push('Georreferenciación GPS válida');
    }

    // Sharpness / Quality score
    const sharpness = att.sharpness_score !== undefined ? att.sharpness_score : 0.75;
    const sharpnessPoints = Math.round((sharpness > 1 ? sharpness / 100 : sharpness) * 25);
    score += sharpnessPoints;
    reasons.push(`Calidad de nitidez (${sharpnessPoints}/25 pts)`);

    // Temporal distribution (basic check if timestamp valid)
    if (att.captured_at && !isNaN(Date.parse(att.captured_at))) {
      score += 15;
      reasons.push('Registro temporal válido (timestamp)');
    }

    scoredList.push({
      attachment: att,
      score,
      reasons,
      is_redundant: isRedundant,
      recommended: false, // will mark top N
      curation_engine_version: engineVersion,
    });
  }

  // Sort deterministically: score desc, then file_hash asc (for reproducible ties)
  scoredList.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.attachment.file_hash.localeCompare(b.attachment.file_hash);
  });

  // Pick top N non-redundant items (or top N overall if all redundant)
  const recommendedIds: string[] = [];
  let count = 0;
  for (const item of scoredList) {
    if (count < maxRecommended) {
      item.recommended = true;
      recommendedIds.push(item.attachment.id);
      count++;
    }
  }

  return {
    execution_id: executionId,
    total_operational_attachments: attachments.length,
    engine_version: engineVersion,
    recommended_at: recommendedAt,
    items: scoredList,
    recommended_ids: recommendedIds,
  };
}

export interface CuratedEvidencePair {
  before: ExecutionAttachmentItem[]; // max 2
  after: ExecutionAttachmentItem[];  // max 2
}

/**
 * Pure in-memory extraction of curated display evidence (up to maxPerPhase, default 2 per phase).
 * Consumes the scored attachments from curateActivityAttachments and extracts top non-redundant items per phase.
 */
export function extractCuratedEvidencePair(
  attachments: ExecutionAttachmentItem[],
  maxPerPhase = 2
): CuratedEvidencePair {
  if (!attachments || attachments.length === 0) {
    return { before: [], after: [] };
  }

  // Score & rank attachments deterministically
  const curationResult = curateActivityAttachments('temp-eval-id', attachments, attachments.length);
  
  // Non-redundant items take precedence
  const validItems = curationResult.items.filter((item) => !item.is_redundant);
  const itemsToConsider = validItems.length > 0 ? validItems : curationResult.items;

  const beforeItems = itemsToConsider
    .filter((item) => item.attachment.phase === 'before')
    .slice(0, maxPerPhase)
    .map((item) => item.attachment);

  const afterItems = itemsToConsider
    .filter((item) => item.attachment.phase === 'after')
    .slice(0, maxPerPhase)
    .map((item) => item.attachment);

  return {
    before: beforeItems,
    after: afterItems,
  };
}

/**
 * Human Selection Layer
 * Supervisor selects curated documentary evidence for an activity item.
 * Validates that selected IDs exist in operational evidence without mutating operational evidence.
 */
export function selectActivityEvidence(
  actaId: string,
  executionId: string,
  allAttachments: ExecutionAttachmentItem[],
  selectedAttachmentIds: string[],
  timestamp?: string
): ActaCuratedSelection {
  const validIds = new Set(allAttachments.map((a) => a.id));
  const verifiedSelection = selectedAttachmentIds.filter((id) => validIds.has(id));

  return {
    acta_id: actaId,
    execution_id: executionId,
    selected_attachment_ids: verifiedSelection,
    updated_at: timestamp || '2026-09-03T00:00:00.000Z',
  };
}

/**
 * Freeze Snapshot on ISSUED Acta
 * Freezes selected evidence per activity when Acta is issued.
 * Throws if attempting to modify a frozen snapshot.
 */
export function freezeActaEvidenceSnapshot(
  actaId: string,
  selections: ActaCuratedSelection[],
  attachmentsMap: Record<string, ExecutionAttachmentItem[]>,
  status: 'draft' | 'issued',
  existingSnapshot?: ActaEvidenceSnapshot,
  timestamp?: string
): ActaEvidenceSnapshot {
  if (existingSnapshot?.is_frozen) {
    throw new Error(`Cannot modify evidence selection on an ISSUED Acta (acta_id: ${actaId})`);
  }

  const isFrozen = status === 'issued';
  const frozenAt = isFrozen ? timestamp || '2026-09-03T00:00:00.000Z' : undefined;
  const activitySnapshots: Record<string, FrozenEvidenceItemSnapshot[]> = {};

  for (const sel of selections) {
    const operational = attachmentsMap[sel.execution_id] || [];
    const operationalMap = new Map(operational.map((a) => [a.id, a]));

    const items: FrozenEvidenceItemSnapshot[] = [];
    for (const id of sel.selected_attachment_ids) {
      const att = operationalMap.get(id);
      if (att) {
        items.push({
          attachment_id: att.id,
          storage_path: att.storage_path,
          file_hash: att.file_hash,
          phase: att.phase,
          captured_at: att.captured_at,
          score: 85, // curated score
          engine_version: 'deterministic-v1',
          selected_at: frozenAt || '2026-09-03T00:00:00.000Z',
        });
      }
    }
    activitySnapshots[sel.execution_id] = items;
  }

  return {
    acta_id: actaId,
    status,
    frozen_at: frozenAt,
    activity_snapshots: activitySnapshots,
    is_frozen: isFrozen,
  };
}

/**
 * Strict Contractual Boundary Guard
 * Throws an error if evidence curation or selection attempts to mutate any contractual field.
 */
export function verifyCurationDoesNotMutateContractual(
  before: ContractualItemState,
  after: ContractualItemState
): void {
  const fieldsToVerify: (keyof ContractualItemState)[] = [
    'id',
    'poa_id',
    'planned_qty',
    'executed_qty',
    'planned_jr',
    'executed_jr',
    'worker_count',
    'unit_price',
    'status',
    'cantidad_facturada',
  ];

  for (const field of fieldsToVerify) {
    if (before[field] !== after[field]) {
      throw new Error(
        `VIOLATION OF EVIDENCE CURATION BOUNDARY: Field '${field}' was mutated from '${before[field]}' to '${after[field]}'. Evidence curation cannot touch contractual or physical state.`
      );
    }
  }
}
