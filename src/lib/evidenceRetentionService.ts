/**
 * Service: Sistema de Retención y Purga Auditable de Evidencia Operacional v1
 * Baseline: FASE 1 (Evidencia Operacional, Galerías y Retención de 90 Días)
 *
 * Reglas Rectoras:
 * 1. Fecha de Expiración: Calculada sobre `captured_at` (captura real), NUNCA sobre `created_at`.
 * 2. Protección Contractual: Derivada estrictamente de snapshots inmutables de Actas en estado 'issued'.
 * 3. Idempotencia Total: El proceso de purga puede ejecutarse N veces sin duplicar logs ni re-intentar borrados.
 * 4. Trazabilidad Indestructible: Elimina el binario pesado de Storage pero mantiene la fila histórica de auditoría.
 */

export type EvidenceLifecycleStatus = 'ACTIVE' | 'PURGE_ELIGIBLE' | 'PURGED' | 'PROTECTED_BY_ACTA';

export interface EvidenceRecord {
  id: string;
  execution_id: string;
  file_name: string;
  file_url: string;
  file_hash: string | null;
  captured_at: string; // Fecha real de captura (ISO string)
  created_at?: string;
  is_purged?: boolean;
}

export interface EvidencePurgeLogEntry {
  evidence_id: string;
  execution_id: string;
  file_name: string;
  file_hash: string | null;
  captured_at: string;
  purged_at: string;
  reason: string;
  retention_policy: string; // ej. '90_DAYS_OPERATIONAL_PURGE'
}

export const STANDARD_RETENTION_DAYS = 90;
export const STANDARD_RETENTION_POLICY = '90_DAYS_OPERATIONAL_PURGE';

/**
 * Calcula la antigüedad en días entre dos fechas (ISO string o Date).
 * Basado en la fecha real de captura `captured_at`.
 */
export function calculateEvidenceAgeDays(capturedAtStr: string, nowInput?: Date | string): number {
  const capturedAt = new Date(capturedAtStr).getTime();
  const now = nowInput ? new Date(nowInput).getTime() : Date.now();
  if (isNaN(capturedAt) || isNaN(now)) return 0;
  const diffMs = now - capturedAt;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Evalúa el estado del ciclo de vida de una evidencia.
 * Deriva la protección contractual del conjunto de `protectedAttachmentIds`
 * (proveniente de snapshots inmutables de Actas en estado 'issued').
 */
export function evaluateEvidenceLifecycleStatus(
  evidence: EvidenceRecord,
  protectedAttachmentIds: Set<string>,
  nowInput?: Date | string,
  retentionDays = STANDARD_RETENTION_DAYS
): EvidenceLifecycleStatus {
  if (evidence.is_purged) {
    return 'PURGED';
  }

  // 1. Protección Contractual Derivada
  if (protectedAttachmentIds.has(evidence.id)) {
    return 'PROTECTED_BY_ACTA';
  }

  // 2. Evaluación de Expiración por captured_at
  const ageDays = calculateEvidenceAgeDays(evidence.captured_at, nowInput);
  if (ageDays >= retentionDays) {
    return 'PURGE_ELIGIBLE';
  }

  return 'ACTIVE';
}

export interface PurgeResult {
  processedCount: number;
  purgedCount: number;
  skippedProtectedCount: number;
  skippedActiveCount: number;
  alreadyPurgedCount: number;
  purgedIds: string[];
  purgeLogs: EvidencePurgeLogEntry[];
}

/**
 * Ejecuta el job de purga idempotente sobre un conjunto de evidencias.
 * Es una función pura y testeable que recibe las dependencias de borrado y logging.
 */
export async function runEvidenceRetentionJob(
  evidences: EvidenceRecord[],
  protectedAttachmentIds: Set<string>,
  existingPurgeLogIds: Set<string>,
  removeStorageFileFn?: (fileUrl: string) => Promise<boolean>,
  nowInput?: Date | string,
  retentionDays = STANDARD_RETENTION_DAYS
): Promise<PurgeResult> {
  const nowStr = nowInput
    ? (typeof nowInput === 'string' ? nowInput : nowInput.toISOString())
    : new Date().toISOString();

  const result: PurgeResult = {
    processedCount: evidences.length,
    purgedCount: 0,
    skippedProtectedCount: 0,
    skippedActiveCount: 0,
    alreadyPurgedCount: 0,
    purgedIds: [],
    purgeLogs: [],
  };

  for (const item of evidences) {
    // Idempotencia: Si la evidencia ya fue purgada o su log de purga existe, omitir
    if (item.is_purged || existingPurgeLogIds.has(item.id)) {
      result.alreadyPurgedCount++;
      continue;
    }

    const status = evaluateEvidenceLifecycleStatus(item, protectedAttachmentIds, nowStr, retentionDays);

    if (status === 'PROTECTED_BY_ACTA') {
      result.skippedProtectedCount++;
      continue;
    }

    if (status === 'ACTIVE') {
      result.skippedActiveCount++;
      continue;
    }

    if (status === 'PURGE_ELIGIBLE') {
      // Intentar borrado físico del objeto pesado en Storage si la función fue provista
      if (removeStorageFileFn) {
        try {
          await removeStorageFileFn(item.file_url);
        } catch (_err) {
          // Si falla la red/storage, no registrar purga para reintentar en la siguiente ejecución
          continue;
        }
      }

      const logEntry: EvidencePurgeLogEntry = {
        evidence_id: item.id,
        execution_id: item.execution_id,
        file_name: item.file_name,
        file_hash: item.file_hash,
        captured_at: item.captured_at,
        purged_at: nowStr,
        reason: `Superó el período de retención operacional de ${retentionDays} días desde captured_at (${item.captured_at.slice(0, 10)}) y no posee protección de Acta emitida.`,
        retention_policy: STANDARD_RETENTION_POLICY,
      };

      result.purgedCount++;
      result.purgedIds.push(item.id);
      result.purgeLogs.push(logEntry);
      existingPurgeLogIds.add(item.id);
      item.is_purged = true;
    }
  }

  return result;
}
