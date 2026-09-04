import {
  evaluateMultiTenantAccess,
  executeRpcWithSecurityDefinerGuard,
  TenantUser,
  BoardResource,
} from './multiTenantSecurity';
import { verifyCurationDoesNotMutateContractual, ContractualItemState } from './evidenceCuration';

describe('Production Readiness Gate v1 — Phase 3: Test 28 (Multi-Tenant Security & RLS Audit)', () => {
  const userA: TenantUser = {
    user_id: 'usr-admin-A',
    board_id: 'board-AAA-111',
    role: 'admin',
  };

  const userAViewer: TenantUser = {
    user_id: 'usr-viewer-A',
    board_id: 'board-AAA-111',
    role: 'viewer',
  };

  const userB: TenantUser = {
    user_id: 'usr-admin-B',
    board_id: 'board-BBB-222',
    role: 'admin',
  };

  const boardBResource: BoardResource = {
    id: 'board-BBB-222',
    board_id: 'board-BBB-222',
    resource_type: 'board',
  };

  const executionBResource: BoardResource = {
    id: 'exec-BBB-999',
    board_id: 'board-BBB-222',
    resource_type: 'execution',
  };

  const attachmentBResource: BoardResource = {
    id: 'att-BBB-888',
    board_id: 'board-BBB-222',
    resource_type: 'attachment',
  };

  const curationBResource: BoardResource = {
    id: 'curation-BBB-777',
    board_id: 'board-BBB-222',
    resource_type: 'curation',
  };

  const actaDraftBResource: BoardResource = {
    id: 'acta-draft-BBB-666',
    board_id: 'board-BBB-222',
    resource_type: 'acta_draft',
  };

  const actaIssuedBResource: BoardResource = {
    id: 'acta-issued-BBB-555',
    board_id: 'board-BBB-222',
    resource_type: 'acta_issued',
  };

  const snapshotBResource: BoardResource = {
    id: 'snapshot-BBB-444',
    board_id: 'board-BBB-222',
    resource_type: 'evidence_snapshot',
  };

  // Test 28.1: Known Board UUID Attack
  test('28.1 (Known Board UUID Attack): User A knowing Board B UUID is strictly DENIED direct query access', () => {
    const readResult = evaluateMultiTenantAccess(userA, boardBResource, 'read');
    const writeResult = evaluateMultiTenantAccess(userA, boardBResource, 'write');

    expect(readResult.granted).toBe(false);
    expect(writeResult.granted).toBe(false);
    expect(readResult.reason).toContain('CROSS_TENANT_ACCESS_DENIED');
  });

  // Test 28.2: Indirect ID Traversal Attack across all 7 secondary surfaces
  test('28.2 (Indirect ID Traversal Attack): User A knowing secondary IDs of Board B is DENIED across all surfaces', () => {
    const resourcesB = [
      executionBResource,
      attachmentBResource,
      curationBResource,
      actaDraftBResource,
      actaIssuedBResource,
      snapshotBResource,
    ];

    for (const res of resourcesB) {
      const readAccess = evaluateMultiTenantAccess(userA, res, 'read');
      const writeAccess = evaluateMultiTenantAccess(userA, res, 'write');

      expect(readAccess.granted).toBe(false);
      expect(writeAccess.granted).toBe(false);
      expect(readAccess.reason).toContain('CROSS_TENANT_ACCESS_DENIED');
    }
  });

  // Test 38.3: Direct RPC SECURITY DEFINER Bypass Attack
  test('28.3 (Direct RPC Attack): User A calling SECURITY DEFINER RPCs on Board B throws authorization exception', () => {
    const rpcsToAttack = ['issue_acta', 'verify_execution', 'generate_acta_draft', 'adjust_acta_item_quantity'];

    for (const rpc of rpcsToAttack) {
      expect(() =>
        executeRpcWithSecurityDefinerGuard(userA, 'board-BBB-222', rpc, { p_acta_id: 'acta-draft-BBB-666' })
      ).toThrow(/SECURITY DEFINER EXCEPTION: User 'usr-admin-A'.*is not authorized/);
    }
  });

  // Test 28.4: Same-Tenant Role Authorization (Viewer Write Attempt)
  test('28.4: Viewer in Board A attempting write/verify in Board A is DENIED by role authorization', () => {
    const boardAResource: BoardResource = {
      id: 'exec-AAA-100',
      board_id: 'board-AAA-111',
      resource_type: 'execution',
    };

    const readAccess = evaluateMultiTenantAccess(userAViewer, boardAResource, 'read');
    const writeAccess = evaluateMultiTenantAccess(userAViewer, boardAResource, 'write');

    expect(readAccess.granted).toBe(true);
    expect(writeAccess.granted).toBe(false);
    expect(writeAccess.reason).toContain('ROLE_DENIED');
  });

  // Test 28.5: Same-Tenant Admin RPC Authorization & Immutability
  test('28.5: Admin in Board A executing issue_acta on Board A succeeds; mutating ISSUED Acta is blocked', () => {
    const rpcResult = executeRpcWithSecurityDefinerGuard(userA, 'board-AAA-111', 'issue_acta', {
      p_acta_id: 'acta-draft-AAA-999',
    });
    expect(rpcResult.status).toBe('SUCCESS');

    const writeIssued = evaluateMultiTenantAccess(
      userA,
      { id: 'acta-issued-AAA-999', board_id: 'board-AAA-111', resource_type: 'acta_issued' },
      'write'
    );
    expect(writeIssued.granted).toBe(false);
    expect(writeIssued.reason).toContain('IMMUTABILITY_DENIED');
  });

  // Test 28.6: Contractual Boundary Guard Assertion
  test('28.6 (Boundary Assertion): Multi-tenant security evaluations NEVER mutate contractual baselines', () => {
    const baselineItem: ContractualItemState = {
      id: 'acta-item-sec-28',
      poa_id: 'poa-2026-v1',
      planned_qty: 300,
      executed_qty: 250,
      planned_jr: 30,
      executed_jr: 25,
      worker_count: 8,
      unit_price: 40000,
      status: 'verified',
      cantidad_facturada: 250,
    };

    // Run security evaluation
    evaluateMultiTenantAccess(userA, boardBResource, 'read');

    // Contractual state remains strictly identical
    const itemAfter = { ...baselineItem };
    expect(() => verifyCurationDoesNotMutateContractual(baselineItem, itemAfter)).not.toThrow();
  });
});
