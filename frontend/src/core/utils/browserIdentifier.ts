/**
 * Browser identifier utility for anonymous usage tracking
 * Generates and persists a unique UUID in localStorage for WAU tracking
 */

const BROWSER_ID_KEY = 'stirling_browser_id';

/**
 * Gets or creates a unique browser identifier
 * Used for Weekly Active Users (WAU) tracking in no-login mode
 */
export function getBrowserId(): string {
  try {
    // Try to get existing ID from localStorage
    let browserId = localStorage.getItem(BROWSER_ID_KEY);

    if (!browserId) {
      // Generate new UUID v4
      browserId = generateUUID();
      localStorage.setItem(BROWSER_ID_KEY, browserId);
    }

    return browserId;
  } catch (error) {
    // Fallback to session-based ID if localStorage is unavailable
    console.warn('localStorage unavailable, using session-based ID', error);
    return `session_${generateUUID()}`;
  }
}

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback to manual UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
