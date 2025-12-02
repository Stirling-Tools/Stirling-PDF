/**
 * Route constants used across the application
 */

/**
 * Routes where onboarding, cookie consent, and upgrade banners should not appear.
 * These are authentication-related pages where users are not yet logged in or
 * the main app chrome is not displayed.
 */
export const AUTH_ROUTES = [
  '/login',
  '/signup',
  '/auth',
  '/invite',
  '/forgot-password',
  '/reset-password',
];

/**
 * Check if a pathname matches any auth route
 */
export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

