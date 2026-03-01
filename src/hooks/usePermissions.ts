// src/hooks/usePermissions.ts
import { useAuth } from '@/contexts/AuthContext';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/permissions';

// Re-export for convenience in components
export { PERMISSIONS, ROLES };

type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
type Role = typeof ROLES[keyof typeof ROLES];

/**
 * A hook to centralize access control logic in the frontend.
 * It provides the current user's role and a function to check permissions.
 *
 * @returns An object containing:
 *  - `user`: The current user object from `useAuth`.
 *  - `role`: The user's role, defaulting to 'MEMBER'.
 *  - `can`: A function to check if the user has a specific permission.
 *  - `loading`: The authentication loading state.
 */
export function usePermissions() {
  const { user, loading } = useAuth();

  // Determine the user's role from Supabase metadata, with a safe fallback.
  const role = (user?.user_metadata?.role as Role) || ROLES.MEMBER;

  /**
   * Checks if the current user has a specific permission.
   * @param permission The permission to check against.
   * @returns `true` if the user has the permission, `false` otherwise.
   */
  const can = (permission: Permission): boolean => {
    if (loading) {
      return false; // Do not grant permissions while auth state is loading
    }
    // Admins can always do everything, bypassing the permissions map for safety.
    if (role === ROLES.ADMIN) {
      return true;
    }
    // Check if the role's permission array includes the requested permission.
    return ROLE_PERMISSIONS[role]?.includes(permission) || false;
  };

  return { user, role, can, loading };
}
