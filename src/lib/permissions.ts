// src/lib/permissions.ts

/**
 * Defines the roles available in the application.
 * These should correspond to the roles you manage in Supabase user metadata.
 */
export const ROLES = {
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project-manager',
  MEMBER: 'member',
  CLIENT: 'client',
} as const;

type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Defines the specific, granular permissions for actions within the application.
 * These are used to check capabilities, abstracting away the direct role check.
 */
export const PERMISSIONS = {
  // Board/Task Permissions
  CREATE_ITEMS: 'items:create',
  DELETE_ITEMS: 'items:delete',
  EDIT_ANY_ITEM: 'items:edit_any',
  ASSIGN_USERS: 'items:assign',

  // Financial Permissions
  VIEW_FINANCIALS: 'financials:view',
  EDIT_FINANCIALS: 'financials:edit',

  // Settings & Admin Permissions
  MANAGE_USERS: 'users:manage',
  EDIT_BOARD_SETTINGS: 'board:edit_settings',
  MANAGE_AUTOMATIONS: 'automations:manage',
} as const;

type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Maps roles to their granted permissions.
 * This is the single source of truth for frontend permissions.
 * The most secure restrictions are always at the Supabase RLS level.
 * This frontend mapping is primarily for UI/UX purposes (e.g., hiding a button).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.ADMIN]: [
    // Admins can do everything
    PERMISSIONS.CREATE_ITEMS,
    PERMISSIONS.DELETE_ITEMS,
    PERMISSIONS.EDIT_ANY_ITEM,
    PERMISSIONS.ASSIGN_USERS,
    PERMISSIONS.VIEW_FINANCIALS,
    PERMISSIONS.EDIT_FINANCIALS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.EDIT_BOARD_SETTINGS,
    PERMISSIONS.MANAGE_AUTOMATIONS,
  ],
  [ROLES.PROJECT_MANAGER]: [
    PERMISSIONS.CREATE_ITEMS,
    PERMISSIONS.DELETE_ITEMS,
    PERMISSIONS.EDIT_ANY_ITEM,
    PERMISSIONS.ASSIGN_USERS,
    PERMISSIONS.VIEW_FINANCIALS,
  ],
  [ROLES.MEMBER]: [
    PERMISSIONS.CREATE_ITEMS,
  ],
  [ROLES.CLIENT]: [
    // Clients might have read-only access to certain things, for example.
    // For now, they have no specific permissions granted here.
  ],
};
