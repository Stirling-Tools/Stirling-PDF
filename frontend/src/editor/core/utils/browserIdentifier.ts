/**
 * Browser identifier utility for anonymous usage tracking
 * Generates and persists a unique UUID in localStorage for WAU tracking
 */

import { generateId } from "@app/utils/generateId";

const BROWSER_ID_KEY = "stirling_browser_id";

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
    console.warn("localStorage unavailable, using session-based ID", error);
    return `session_${generateUUID()}`;
  }
}

function generateUUID(): string {
  return generateId();
}
