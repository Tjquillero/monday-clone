/**
 * Multi-Tenant Security & RLS Isolation Evaluator
 * Production Readiness Gate v1 — Phase 3: Test 28
 * 
 * Implements authoritative tenant isolation rules:
 * - Direct UUID queries across boards -> DENIED
 * - Indirect ID traversal across boards -> DENIED
 * - Direct SECURITY DEFINER RPC invocations across boards -> DENIED / THROW EXCEPTION
 */

export interface TenantUser {
  user_id: string;
  board_id: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface BoardResource {
  id: string;
  board_id: string;
  resource_type:
    | 'board'
    | 'schedule'
    | 'execution'
    | 'attachment'
    | 'curation'
    | 'acta_draft'
    | 'acta_issued'
    | 'evidence_snapshot';
}

export interface AccessResult {
  granted: boolean;
  reason: string;
}

/**
 * Evaluates tenant isolation for direct and indirect entity access.
 */
export function evaluateMultiTenantAccess(
  user: TenantUser,
  resource: BoardResource,
  operation: 'read' | 'write' | 'rpc'
): AccessResult {
  // Cross-tenant access check: Strict Board Boundary
  if (user.board_id !== resource.board_id) {
    return {
      granted: false,
      reason: `CROSS_TENANT_ACCESS_DENIED: User from board '${user.board_id}' attempted ${operation} on resource '${resource.id}' belonging to board '${resource.board_id}'.`,
    };
  }

  // Same-tenant role authorization check
  if (operation === 'write' || operation === 'rpc') {
    if (resource.resource_type === 'acta_issued' || resource.resource_type === 'evidence_snapshot') {
      return {
        granted: false,
        reason: `IMMUTABILITY_DENIED: Resource '${resource.id}' is locked and immutable.`,
      };
    }

    if (user.role === 'viewer') {
      return {
        granted: false,
        reason: `ROLE_DENIED: Viewer cannot perform ${operation} on resource '${resource.id}'.`,
      };
    }
  }

  return {
    granted: true,
    reason: `ACCESS_GRANTED: User '${user.user_id}' authorized for ${operation} on '${resource.id}'.`,
  };
}

/**
 * Simulates RPC SECURITY DEFINER execution with authoritative board role check.
 * Throws exception if user attempts cross-tenant execution.
 */
export function executeRpcWithSecurityDefinerGuard(
  user: TenantUser,
  targetBoardId: string,
  rpcName: string,
  params: Record<string, unknown>
): { status: 'SUCCESS'; result_id: string } {
  // 1. Authoritative Board Role Verification under SECURITY DEFINER
  if (user.board_id !== targetBoardId) {
    throw new Error(
      `SECURITY DEFINER EXCEPTION: User '${user.user_id}' (Board: '${user.board_id}') is not authorized to execute RPC '${rpcName}' on target Board '${targetBoardId}'. Access DENIED.`
    );
  }

  // 2. Role Authorization Check for admin-only RPCs (e.g. issue_acta)
  if (rpcName === 'issue_acta' && user.role !== 'admin') {
    throw new Error(
      `SECURITY DEFINER EXCEPTION: Solo administradores del board '${targetBoardId}' pueden ejecutar 'issue_acta'. User role is '${user.role}'.`
    );
  }

  return {
    status: 'SUCCESS',
    result_id: (params.p_acta_id as string) || (params.p_execution_id as string) || targetBoardId,
  };
}
