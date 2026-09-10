import {
  calculateEvidenceAgeDays,
  evaluateEvidenceLifecycleStatus,
  runEvidenceRetentionJob,
  EvidenceRecord,
  EvidencePurgeLogEntry,
} from '../evidenceRetentionService';

describe('Evidence Retention & Idempotent Purge Engine v1', () => {
  const NOW = '2026-09-09T00:00:00.000Z'; // Fecha fija de prueba

  const sampleRecentPhoto: EvidenceRecord = {
    id: 'photo_recent_001',
    execution_id: 'exec_001',
    file_name: 'limpieza_001.jpg',
    file_url: 'https://supabase.co/storage/v1/object/public/attachments/execution/exec_001/limpieza_001.jpg',
    file_hash: 'hash_abc_123',
    captured_at: '2026-08-15T10:00:00.000Z', // 25 días atrás
  };

  const sampleExpiredPhoto: EvidenceRecord = {
    id: 'photo_expired_002',
    execution_id: 'exec_002',
    file_name: 'poda_002.jpg',
    file_url: 'https://supabase.co/storage/v1/object/public/attachments/execution/exec_002/poda_002.jpg',
    file_hash: 'hash_def_456',
    captured_at: '2026-05-01T10:00:00.000Z', // 130 días atrás ( > 90 días)
    created_at: '2026-06-01T10:00:00.000Z',  // Creada después (simula offline)
  };

  const sampleProtectedPhoto: EvidenceRecord = {
    id: 'photo_protected_003',
    execution_id: 'exec_003',
    file_name: 'corte_003.jpg',
    file_url: 'https://supabase.co/storage/v1/object/public/attachments/execution/exec_003/corte_003.jpg',
    file_hash: 'hash_ghi_789',
    captured_at: '2026-04-01T10:00:00.000Z', // 161 días atrás ( > 90 días)
  };

  test('1. calculateEvidenceAgeDays evalúa la antigüedad basándose en captured_at', () => {
    const ageDays = calculateEvidenceAgeDays(sampleExpiredPhoto.captured_at, NOW);
    expect(ageDays).toBe(130);

    // Verificar que NO usa created_at
    const ageFromCreated = calculateEvidenceAgeDays(sampleExpiredPhoto.created_at!, NOW);
    expect(ageFromCreated).toBe(99);
    expect(ageDays).not.toBe(ageFromCreated);
  });

  test('2. evaluateEvidenceLifecycleStatus retorna ACTIVE para evidencias dentro del margen de 90 días', () => {
    const protectedSet = new Set<string>();
    const status = evaluateEvidenceLifecycleStatus(sampleRecentPhoto, protectedSet, NOW);
    expect(status).toBe('ACTIVE');
  });

  test('3. evaluateEvidenceLifecycleStatus retorna PURGE_ELIGIBLE para evidencias mayores a 90 días no protegidas', () => {
    const protectedSet = new Set<string>();
    const status = evaluateEvidenceLifecycleStatus(sampleExpiredPhoto, protectedSet, NOW);
    expect(status).toBe('PURGE_ELIGIBLE');
  });

  test('4. evaluateEvidenceLifecycleStatus retorna PROTECTED_BY_ACTA para evidencias en snapshots de Actas emitidas', () => {
    const protectedSet = new Set<string>(['photo_protected_003']);
    const status = evaluateEvidenceLifecycleStatus(sampleProtectedPhoto, protectedSet, NOW);
    expect(status).toBe('PROTECTED_BY_ACTA');
  });

  test('5. runEvidenceRetentionJob ejecuta purga idempotente y resguarda evidencias contractuales', async () => {
    const evidences: EvidenceRecord[] = [
      { ...sampleRecentPhoto },
      { ...sampleExpiredPhoto },
      { ...sampleProtectedPhoto },
    ];
    const protectedIds = new Set<string>(['photo_protected_003']);
    const existingLogIds = new Set<string>();
    const removedStorageUrls: string[] = [];

    const mockRemoveStorageFn = async (fileUrl: string) => {
      removedStorageUrls.push(fileUrl);
      return true;
    };

    // Primera ejecución
    const result1 = await runEvidenceRetentionJob(
      evidences,
      protectedIds,
      existingLogIds,
      mockRemoveStorageFn,
      NOW
    );

    expect(result1.processedCount).toBe(3);
    expect(result1.purgedCount).toBe(1);
    expect(result1.skippedActiveCount).toBe(1);
    expect(result1.skippedProtectedCount).toBe(1);
    expect(result1.purgedIds).toEqual(['photo_expired_002']);
    expect(removedStorageUrls).toEqual([sampleExpiredPhoto.file_url]);

    // Verificar estructura del log de auditoría
    const log: EvidencePurgeLogEntry = result1.purgeLogs[0];
    expect(log.evidence_id).toBe('photo_expired_002');
    expect(log.file_hash).toBe('hash_def_456');
    expect(log.captured_at).toBe('2026-05-01T10:00:00.000Z');
    expect(log.purged_at).toBe(NOW);
    expect(log.retention_policy).toBe('90_DAYS_OPERATIONAL_PURGE');

    // SEGUNDA EJECUCIÓN (Verificación de Idempotencia):
    // Re-ejecutar el job sobre el mismo dataset y log cargado
    const result2 = await runEvidenceRetentionJob(
      evidences,
      protectedIds,
      existingLogIds,
      mockRemoveStorageFn,
      NOW
    );

    expect(result2.purgedCount).toBe(0);
    expect(result2.alreadyPurgedCount).toBe(1);
    expect(removedStorageUrls.length).toBe(1); // Storage remove NO se volvió a llamar
  });
});
