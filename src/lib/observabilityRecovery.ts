/**
 * Observability, Diagnostic Trace & Log Sanitization Evaluator
 * Production Readiness Gate v1 — Phase 5: Test 30
 * 
 * Provides structured diagnostic logging, attempt tracking, and strict negative log sanitization.
 */

export interface DiagnosticTrace {
  operation_id: string;
  execution_id: string;
  attachment_id?: string;
  attempt: number;
  retry_count: number;
  operation: 'ATTACHMENT_UPLOAD' | 'SYNC_BATCH' | 'SUPERVISION_VERIFY' | 'EVIDENCE_CURATE' | 'ACTA_ISSUE';
  error_class?: 'NETWORK_TIMEOUT' | 'STORAGE_TIMEOUT' | 'DB_TIMEOUT' | 'DUPLICATE_SUBMISSION' | 'CORRUPT_HASH' | 'NONE';
  timestamp: string;
  result: 'SUCCESS' | 'RETRY_QUEUED' | 'RECONCILED' | 'FAILED_BLOCKED';
}

export const FORBIDDEN_LOG_KEYS = [
  'access_token',
  'refresh_token',
  'jwt',
  'password',
  'secret',
  'signed_url',
  'private_storage_path',
  'photo_bytes',
  'authorization',
  'bearer',
];

/**
 * Recursively sanitizes a log object, redacting any forbidden keys or secret tokens.
 */
export function sanitizeLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    const isForbiddenKey = FORBIDDEN_LOG_KEYS.some((forbidden) => lowerKey.includes(forbidden));

    if (isForbiddenKey) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      // Check string value for bearer or JWT tokens
      if (value.startsWith('eyJ') || value.toLowerCase().includes('bearer ')) {
        sanitized[key] = '[REDACTED_TOKEN]';
      } else {
        sanitized[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogPayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export class StructuredAuditLogger {
  private logs: Record<string, unknown>[] = [];

  public logTrace(trace: DiagnosticTrace, metadata?: Record<string, unknown>): Record<string, unknown> {
    const rawPayload = {
      ...trace,
      metadata: metadata || {},
    };

    const sanitized = sanitizeLogPayload(rawPayload);
    this.logs.push(sanitized);
    return sanitized;
  }

  public getSerializedLogs(): string {
    return JSON.stringify(this.logs);
  }

  public getLogs(): Record<string, unknown>[] {
    return this.logs;
  }
}
