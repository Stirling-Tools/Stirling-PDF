import { NavKey } from '@app/components/shared/config/types';

/**
 * Navigate to a specific settings section
 *
 * @param section - The settings section key to navigate to
 *
 * @example
 * // Navigate to People section
 * navigateToSettings('people');
 *
 * // Navigate to Admin Premium section
 * navigateToSettings('adminPremium');
 */
export function navigateToSettings(section: NavKey) {
  const basePath = window.location.pathname.split('/settings')[0] || '';
  const newPath = `${basePath}/settings/${section}`;
  window.history.pushState({}, '', newPath);

  // Trigger a popstate event to notify components
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Get the URL path for a settings section
 * Useful for creating links
 *
 * @param section - The settings section key
 * @returns The URL path for the settings section
 *
 * @example
 * <a href={getSettingsUrl('people')}>Go to People Settings</a>
 * // Returns: "/settings/people"
 */
export function getSettingsUrl(section: NavKey): string {
  return `/settings/${section}`;
}

/**
 * Check if currently viewing a settings section
 *
 * @param section - Optional section key to check for specific section
 * @returns True if in settings (and matching specific section if provided)
 */
export function isInSettings(section?: NavKey): boolean {
  const pathname = window.location.pathname;

  if (!section) {
    return pathname.startsWith('/settings');
  }

  return pathname === `/settings/${section}`;
}
