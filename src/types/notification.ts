/**
 * Domain Types for Module 5: Realtime Operational Notifications & User Inbox Read Model
 * Baseline: v5.0 GO DOCUMENTAL
 */

import { ExecutiveAlertSeverity } from '@/lib/supervisorExecutiveDashboardService';

export interface UserNotification {
  id: string;
  event_id: string;
  notification_dedup_key: string;
  user_id: string;
  board_id: string;
  alert_code: string;
  entity_id: string;
  severity: ExecutiveAlertSeverity | 'INFO';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface UserBoardRole {
  id: string;
  user_id: string;
  board_id: string;
  role: 'SUPERVISOR' | 'DIRECTOR' | 'ADMIN' | 'VERIFIER' | 'HR_ADMIN';
  is_active: boolean;
  created_at?: string;
}

export type AlertEpisodeStatus = 'INACTIVE' | 'ACTIVE';

export interface AlertEpisodeState {
  episodeKey: string; // board_id__entity_id__alertCode
  status: AlertEpisodeStatus;
  lastSourceMutationId?: string;
  updatedAt: string;
}

export interface VerificationTransitionParams {
  boardId: string;
  verificationRecordId: string;
  previousStatus: string;
  newStatus: 'VERIFIED' | 'rejected' | string;
  sourceMutationId: string;
  planItemId?: string;
  occurrenceKey?: string;
}

export interface OperationalAlertEventParams {
  boardId: string;
  entityId: string;
  alertCode: string;
  severity: ExecutiveAlertSeverity;
  title: string;
  message: string;
  sourceMutationId: string;
  previousAlertState: AlertEpisodeStatus;
  newAlertState: AlertEpisodeStatus;
}
