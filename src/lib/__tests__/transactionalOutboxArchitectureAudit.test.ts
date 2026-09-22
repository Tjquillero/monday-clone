/**
 * Test Suite: Auditoría Arquitectónica y de Invariantes Outbox (WF-C08-13 a WF-C08-20)
 * Baseline Entrada: 120 suites / 980 tests
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Transactional Outbox Architecture Audit (WF-C08-13 a WF-C08-20)', () => {
  const typesFilePath = path.join(__dirname, '../../types/transactionalOutbox.ts');
  const serviceFilePath = path.join(__dirname, '../transactionalOutboxService.ts');
  const migrationFilePath = path.join(__dirname, '../../../supabase/migrations/20260913_workflow_outbox_durable_schema.sql');

  test('WF-C08-13: Aislamiento Total H8 (0 imports / 0 llamadas a solvers en el módulo Outbox)', () => {
    const filesToAudit = [typesFilePath, serviceFilePath];
    const forbiddenKeywords = ['resourceConstraints', 'solver', 'solveResourceConstrainedSchedule', 'milp', 'glpk'];

    for (const file of filesToAudit) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const keyword of forbiddenKeywords) {
        expect(content.toLowerCase()).not.toContain(keyword.toLowerCase());
      }
    }
  });

  test('WF-C08-14: Invarianza DDL: domain_event_outbox.board_id tiene ON DELETE RESTRICT (WF-C08-INV-04)', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');
    expect(migrationContent).toMatch(/board_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.boards\(id\)\s+ON\s+DELETE\s+RESTRICT/i);
  });

  test('WF-C08-15: Invarianza DDL: REVOKE EXECUTE FROM PUBLIC en todas las RPCs de infraestructura', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC');
    expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.complete_outbox_event(UUID, UUID, TEXT, TEXT) FROM PUBLIC');
    expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.purge_processed_outbox_events(INTEGER, INTEGER) FROM PUBLIC');
    expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.requeue_dead_letter_event(UUID) FROM PUBLIC');
    expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.get_board_outbox_audit_log(UUID, INTEGER) FROM PUBLIC');
  });

  test('WF-C08-16: Invarianza DDL: Privilegios de infraestructura otorgados exclusivamente a service_role', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) TO service_role');
    expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.complete_outbox_event(UUID, UUID, TEXT, TEXT) TO service_role');
    expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.purge_processed_outbox_events(INTEGER, INTEGER) TO service_role');
    expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.requeue_dead_letter_event(UUID) TO service_role');
    expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.get_board_outbox_audit_log(UUID, INTEGER) TO authenticated');
  });

  test('WF-C08-17: Invarianza DDL: complete_outbox_event implementa CAS estricto con verificación de lease vigente', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    expect(migrationContent).toContain("status = 'CLAIMED'");
    expect(migrationContent).toContain('claim_token = p_claim_token');
    expect(migrationContent).toContain("lease_expires_at > timezone('utc'::text, now())");
  });

  test('WF-C08-18: Invarianza DDL: Proyección tipada de auditoría outbox_audit_projection oculta tokens y leases', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    // Extraer bloque CREATE TYPE outbox_audit_projection
    const match = migrationContent.match(/CREATE TYPE public\.outbox_audit_projection AS \(([\s\S]*?)\);/);
    expect(match).not.toBeNull();
    const typeBody = match ? match[1] : '';

    expect(typeBody).not.toContain('claim_token');
    expect(typeBody).not.toContain('lease_expires_at');
    expect(typeBody).not.toContain('claimed_by');
  });

  test('WF-C08-19: Invarianza DDL: Purga controlada calcula antigüedad de 14 días desde updated_at sobre PROCESSED', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    expect(migrationContent).toContain("status = 'PROCESSED'");
    expect(migrationContent).toContain("updated_at < timezone('utc'::text, now()) - (p_older_than_days || ' days')::INTERVAL");
  });

  test('WF-C08-20: Invarianza SoT: 0 mutaciones directas a tablas maestras de dominio desde transactionalOutboxService', () => {
    const serviceContent = fs.readFileSync(serviceFilePath, 'utf-8');

    expect(serviceContent).not.toMatch(/\.from\(['"]weekly_plan_items['"]\)\.(update|insert|delete)/);
    expect(serviceContent).not.toMatch(/\.from\(['"]weekly_plans['"]\)\.(update|insert|delete)/);
    expect(serviceContent).not.toMatch(/\.from\(['"]actas['"]\)\.(update|insert|delete)/);
  });
});
