/**
 * Types & Canonical Contracts for Hito 7.1B: Execution Sandbox v1.0
 *
 * Axiomas de Gobierno y Seguridad (H7.1B):
 * 1. Aislamiento técnico en Workspace local únicamente (Red = DENY BY DEFAULT, Supabase/Prod = DENY BY DEFAULT).
 * 2. Estructura de Comandos Segura: SandboxCommand { executable, args } (PROHIBIDO ejecucion arbitraria via shell string).
 * 3. Reversión Atómica Verificada: Snapshot con manifiesto SHA-256 y verificación de restauración exacta post-fallo.
 * 4. Hard Stop en Falla de Rollback: Ante desacuerdo en SHA-256 post-rollback -> HARD_STOP_ROLLBACK_FAILED.
 * 5. Fail-Closed Estructural: Ante cualquier duda o exceso de límites -> STOP / ESCALATE.
 */

export type SandboxStatus =
  | 'IDLE'
  | 'CREATING_SNAPSHOT'
  | 'APPLYING_PATCH'
  | 'EXECUTING_VALIDATION'
  | 'PASS_RETAINED'
  | 'FAIL_ROLLBACK_PENDING'
  | 'FAIL_ROLLED_BACK'
  | 'HARD_STOP_ROLLBACK_FAILED';

export interface SandboxCommand {
  executable: 'npx' | 'npm' | 'git';
  args: string[];
  timeoutMs?: number;
}

export interface FileSnapshotManifest {
  path: string;
  sha256: string;
  sizeBytes: number;
  originalContent: string;
}

export interface WorkspaceSnapshot {
  snapshotId: string;
  createdAt: string; // ISO 8601 UTC
  manifest: Record<string, FileSnapshotManifest>;
  affectedFiles: string[];
}

export interface SandboxLimits {
  maxExecutionTimeMs: number;
  maxCommandsPerSession: number;
  maxFilesChanged: number;
  maxPatchSizeBytes: number;
  networkAllowed: false;
  productionAllowed: false;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  maxExecutionTimeMs: 60000, // 60s
  maxCommandsPerSession: 5,
  maxFilesChanged: 10,
  maxPatchSizeBytes: 51200, // 50 KB
  networkAllowed: false,
  productionAllowed: false,
};

export interface SandboxExecutionResult {
  sandboxId: string;
  status: SandboxStatus;
  validationGates: {
    jestPassed: boolean;
    tscPassed: boolean;
    buildPassed: boolean;
    gitDiffPassed: boolean;
  };
  rollbackVerified: boolean;
  auditTrail: string[];
}
