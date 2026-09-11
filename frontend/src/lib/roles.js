export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export const isAdmin = (role) => ADMIN_ROLES.includes(role);

/**
 * The landing route for a role. Used by the login screen and by every route
 * guard that needs to bounce someone back where they belong.
 */
export const homePathFor = (role) => {
  if (isAdmin(role)) return '/admin/dashboard';
  if (role === 'SECURITY') return '/guard/gate';
  if (role === 'RESIDENT') return '/resident/home';
  return '/';
};
