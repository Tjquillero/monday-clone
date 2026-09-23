/**
 * Types & Domain Contracts for Proactive Advisory Observer & Discrepancy Analysis (v1.0)
 *
 * Axioma Rector:
 * EVENTO DE DOMINIO != EVENTO DE SUPERFICIE != RECALCULO PROACTIVO != DECISIÓN HUMANA
 */

import { RecommendationKey } from './operationalAdvisory';

export type DomainEventType =
  | 'WEEKLY_PLAN_SYNC_EVENT'
  | 'EXECUTION_RECORDED_EVENT'
  | 'DECISION_RECORDED_EVENT'
  | 'SURFACE_MOUNT_EVENT';

export interface ProactiveObserverEvent {
  type: DomainEventType;
  scopeType: 'BOARD' | 'SITE';
  scopeId: string;
  payload?: Record<string, unknown>;
  timestampIso?: string;
}

export interface ProactiveAdvisoryFilterOptions {
  cooldownHours?: number;
  excludeAccepted?: boolean;
  excludeRejected?: boolean;
}

/**
 * Calcula la huella digital unívoca del patrón analítico (Fingerprint).
 * Garantiza que N eventos idénticos produzcan la misma identidad determinista.
 */
export function computePatternFingerprint(
  scopeId: string,
  recommendationKey: RecommendationKey,
  entityId: string,
  sourceVersion: string = 'v1'
): string {
  return `fp__${scopeId}__${recommendationKey}__${entityId}__${sourceVersion}`;
}
