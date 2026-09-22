/**
 * Service: Application Event Dispatcher & Notification Engine (Fase 4 · Módulo 5)
 * Baseline Rectora: v5.0 GO DOCUMENTAL (101 suites / 746 tests -> 102 suites / 768 tests)
 *
 * Principios:
 * 1. Despachador de Aplicación determinístico e idempotente (0 mutaciones a tablas de dominio).
 * 2. M4/M3 son fuentes consultivas inmutables: este servicio NUNCA recalcula reglas de capacidad ni consumo.
 * 3. Transición estricta de episodios M4: solo genera notificaciones en la transición INACTIVE -> ACTIVE (M5-C2.3).
 * 4. Deduplicación durable por `notification_dedup_key` (user_id__event_id) con ON CONFLICT DO NOTHING (M5-C2.4).
 * 5. Resolución de destinatarios soberana vía `public.user_board_roles` (`is_active = true`) (M5-C3).
 * 6. Desacoplamiento financiero: `monetaryCostStatus` inmutable en 'UNDETERMINED_MONETARY_COST'.
 * 7. Aislamiento H8: 🔴 STRICTLY NO-GO (0 invocaciones a Solvers).
 */

import {
  UserNotification,
  UserBoardRole,
  AlertEpisodeStatus,
  VerificationTransitionParams,
  OperationalAlertEventParams,
} from '@/types/notification';
import { MonetaryCostStatus } from './resourceConsumptionControlService';

export interface DispatchResult {
  eventId: string;
  dispatchedCount: number;
  notifications: UserNotification[];
  deduplicatedCount: number;
}

/**
 * Mapeo oficial de roles elegibles por código de alerta / evento (M5-C3).
 */
export function getEligibleRolesForAlert(
  alertCodeOrType: string
): Array<'SUPERVISOR' | 'DIRECTOR' | 'ADMIN' | 'VERIFIER' | 'HR_ADMIN'> {
  switch (alertCodeOrType) {
    case 'ALERT-01': // Sobrecarga Cuadrilla
    case 'ALERT-02': // Capacidad Cero S=0
    case 'ALERT-04': // Exceso Consumo JR
      return ['SUPERVISOR', 'DIRECTOR', 'ADMIN'];

    case 'ALERT-03': // Día No Laborable F3.1
    case 'ALERT-05': // Subejecución Alcance Físico
      return ['SUPERVISOR', 'ADMIN'];

    case 'ALERT-06': // Personal Compartido Kp>1
      return ['SUPERVISOR', 'HR_ADMIN', 'ADMIN'];

    case 'VERIFICATION_TRANSITION':
      return ['SUPERVISOR', 'VERIFIER', 'ADMIN'];

    default:
      return ['SUPERVISOR', 'ADMIN'];
  }
}

/**
 * Determina si una alerta M4 constituye una transición de episodio notificable (INACTIVE -> ACTIVE).
 * Previene notificaciones redundantes en transiciones ACTIVE -> ACTIVE (M5-C2.3 / NOTIF-21).
 */
export function shouldGenerateAlertEpisode(
  previousState: AlertEpisodeStatus,
  newState: AlertEpisodeStatus
): boolean {
  return previousState === 'INACTIVE' && newState === 'ACTIVE';
}

/**
 * Valida si una transición de verificación ADR-0011 es notificable.
 * Requiere que previous_status !== new_status y new_status sea 'VERIFIED' o 'rejected' (NOTIF-06 / NOTIF-20).
 */
export function isValidVerificationTransition(previousStatus: string, newStatus: string): boolean {
  if (previousStatus === newStatus) return false;
  return newStatus === 'VERIFIED' || newStatus === 'rejected';
}

/**
 * Construye el event_id determinista de un episodio de alerta M4 (M5-C2.1).
 */
export function buildAlertEventId(
  boardId: string,
  entityId: string,
  alertCode: string,
  sourceMutationId: string
): string {
  return `${boardId}__${entityId}__${alertCode}__${sourceMutationId}`;
}

/**
 * Construye el event_id determinista de una transición de verificación ADR-0011 (M5-C2.2).
 */
export function buildVerificationEventId(
  boardId: string,
  verificationRecordId: string,
  previousStatus: string,
  newStatus: string,
  sourceMutationId: string
): string {
  return `${boardId}__${verificationRecordId}__${previousStatus}__${newStatus}__${sourceMutationId}`;
}

/**
 * Construye la clave unívoca de deduplicación por usuario (M5-C2.4).
 */
export function buildDedupKey(userId: string, eventId: string): string {
  return `${userId}__${eventId}`;
}

/**
 * Filtra los usuarios destinatarios elegibles a partir de `user_board_roles` (M5-C3 / NOTIF-11).
 * NO asume implícitamente que personnel_id === user_id. Usa estrictamente user_board_roles.user_id.
 */
export function resolveRecipients(
  boardRoles: UserBoardRole[],
  boardId: string,
  eligibleRoles: Array<'SUPERVISOR' | 'DIRECTOR' | 'ADMIN' | 'VERIFIER' | 'HR_ADMIN'>
): string[] {
  const recipientUserIds = new Set<string>();

  for (const r of boardRoles) {
    if (r.board_id === boardId && r.is_active && eligibleRoles.includes(r.role)) {
      recipientUserIds.add(r.user_id);
    }
  }

  return Array.from(recipientUserIds);
}

/**
 * Motor de Despacho de Alertas Operacionales M4 (ALERT-01 ... ALERT-06).
 */
export function processAlertEventDispatch(params: {
  eventParams: OperationalAlertEventParams;
  boardRoles: UserBoardRole[];
  existingNotifications?: UserNotification[];
}): DispatchResult {
  const { eventParams, boardRoles, existingNotifications = [] } = params;
  const {
    boardId,
    entityId,
    alertCode,
    severity,
    title,
    message,
    sourceMutationId,
    previousAlertState,
    newAlertState,
  } = eventParams;

  // 1. Evaluar transición de episodio M4 (INACTIVE -> ACTIVE)
  if (!shouldGenerateAlertEpisode(previousAlertState, newAlertState)) {
    return {
      eventId: buildAlertEventId(boardId, entityId, alertCode, sourceMutationId),
      dispatchedCount: 0,
      notifications: [],
      deduplicatedCount: 0,
    };
  }

  // 2. Construir event_id determinista (M5-C2.1)
  const eventId = buildAlertEventId(boardId, entityId, alertCode, sourceMutationId);

  // 3. Resolver destinatarios según roles elegibles en user_board_roles (M5-C3)
  const eligibleRoles = getEligibleRolesForAlert(alertCode);
  const recipientUserIds = resolveRecipients(boardRoles, boardId, eligibleRoles);

  const newNotifications: UserNotification[] = [];
  let deduplicatedCount = 0;

  const existingKeys = new Set(existingNotifications.map((n) => n.notification_dedup_key));

  for (const userId of recipientUserIds) {
    const dedupKey = buildDedupKey(userId, eventId);

    // Simular ON CONFLICT DO NOTHING
    if (existingKeys.has(dedupKey)) {
      deduplicatedCount++;
      continue;
    }

    const notif: UserNotification = {
      id: `notif-${Math.random().toString(36).substring(2, 9)}`,
      event_id: eventId,
      notification_dedup_key: dedupKey,
      user_id: userId,
      board_id: boardId,
      alert_code: alertCode,
      entity_id: entityId,
      severity,
      title,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    newNotifications.push(notif);
    existingKeys.add(dedupKey);
  }

  return {
    eventId,
    dispatchedCount: newNotifications.length,
    notifications: newNotifications,
    deduplicatedCount,
  };
}

/**
 * Motor de Despacho de Transiciones de Verificación ADR-0011.
 */
export function processVerificationTransitionDispatch(params: {
  transitionParams: VerificationTransitionParams;
  boardRoles: UserBoardRole[];
  existingNotifications?: UserNotification[];
}): DispatchResult {
  const { transitionParams, boardRoles, existingNotifications = [] } = params;
  const { boardId, verificationRecordId, previousStatus, newStatus, sourceMutationId } = transitionParams;

  // 1. Validar transición notificable ADR-0011
  if (!isValidVerificationTransition(previousStatus, newStatus)) {
    return {
      eventId: buildVerificationEventId(boardId, verificationRecordId, previousStatus, newStatus, sourceMutationId),
      dispatchedCount: 0,
      notifications: [],
      deduplicatedCount: 0,
    };
  }

  // 2. Construir event_id determinista (M5-C2.2)
  const eventId = buildVerificationEventId(
    boardId,
    verificationRecordId,
    previousStatus,
    newStatus,
    sourceMutationId
  );

  // 3. Resolver destinatarios elegibles
  const eligibleRoles = getEligibleRolesForAlert('VERIFICATION_TRANSITION');
  const recipientUserIds = resolveRecipients(boardRoles, boardId, eligibleRoles);

  const severity = newStatus === 'VERIFIED' ? 'HIGH' : 'MEDIUM';
  const title = newStatus === 'VERIFIED' ? 'Verificación Aprobada' : 'Verificación Rechazada';
  const message = `La verificación ${verificationRecordId} cambió de ${previousStatus} a ${newStatus}.`;

  const newNotifications: UserNotification[] = [];
  let deduplicatedCount = 0;

  const existingKeys = new Set(existingNotifications.map((n) => n.notification_dedup_key));

  for (const userId of recipientUserIds) {
    const dedupKey = buildDedupKey(userId, eventId);

    if (existingKeys.has(dedupKey)) {
      deduplicatedCount++;
      continue;
    }

    const notif: UserNotification = {
      id: `notif-${Math.random().toString(36).substring(2, 9)}`,
      event_id: eventId,
      notification_dedup_key: dedupKey,
      user_id: userId,
      board_id: boardId,
      alert_code: 'VERIFICATION_CHANGE',
      entity_id: verificationRecordId,
      severity,
      title,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    newNotifications.push(notif);
    existingKeys.add(dedupKey);
  }

  return {
    eventId,
    dispatchedCount: newNotifications.length,
    notifications: newNotifications,
    deduplicatedCount,
  };
}

/**
 * Propiedad inalterable de desacoplamiento financiero.
 */
export function getNotificationMonetaryCostStatus(): MonetaryCostStatus {
  return 'UNDETERMINED_MONETARY_COST';
}
