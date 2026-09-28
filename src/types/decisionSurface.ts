/**
 * Mantenix - Hito 7.11 Governed Human Decision Surface v1.0
 * Contratos de Tipos e Interfaz de Presentación Consultiva del Expediente de Decisión
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 migraciones SQL, 0 RPCs de escritura, 0 callbacks de ejecución.
 * - H6.2 -> H7.10 READ ONLY: Capas previas intactas y consumidas como autoridad soberana.
 * - Categoría A: Read-Only, 100% presentación consultiva, neutral y determinista.
 * - Prohibición de Evaluación Normativa: 0 rankings, scores o etiquetas evaluativas añadidas.
 * - Cero Valores Mágicos: null jamás se renderiza como 0, 0% o 0.0x.
 * - Invariante de No-Autorización: Rótulo prominente de advertencia consultiva.
 */

import { DecisionContextDossier, HistoricalFeedbackStatus } from './decisionContextDossier';
import { RepairProposalRecord, RepairActionType } from './repairProposal';

/**
 * Mapeo canónico a etiquetas legibles neutrales para RepairActionType
 */
export const ACTION_TYPE_LABEL_MAP: Record<RepairActionType, string> = {
  PROPOSE_CREW_REASSIGNMENT: 'Reasignación de Cuadrilla',
  PROPOSE_SCHEDULE_OVERRIDE: 'Reprogramación de Mantenimiento',
  PROPOSE_RESOURCE_REBALANCE: 'Rebalanceo de Recursos',
  PROPOSE_CONTRACT_TARGET_REVIEW: 'Revisión Contractual POA',
  PROPOSE_FIELD_INSPECTION_TICKET: 'Ticket de Inspección en Campo',
  PROPOSE_SUPERVISOR_ALERT: 'Alerta Estructurada a Supervisión',
};

/**
 * Mapeo canónico a etiquetas descriptivas neutras para HistoricalFeedbackStatus
 */
export const HISTORICAL_FEEDBACK_STATUS_LABEL_MAP: Record<HistoricalFeedbackStatus, string> = {
  HISTORICAL_EVALUATIONS_AVAILABLE: 'Evaluaciones Históricas Disponibles',
  ONLY_INDETERMINATE_EVIDENCE: 'Evidencia Histórica Indeterminada',
  NO_HISTORICAL_DATA: 'Sin Antecedentes en Memoria',
  INDETERMINATE_INPUT: 'Entrada Indeterminada / Datos Incompletos',
};

/**
 * Props del Componente Consultivo DecisionContextDossierCard
 */
export interface DecisionContextDossierCardProps {
  dossier: DecisionContextDossier;
  proposal?: RepairProposalRecord | null;
  className?: string;
  testId?: string;
}
