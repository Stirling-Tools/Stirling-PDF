/**
 * Helper utilities for handling settings with pending changes that require restart.
 *
 * Backend returns settings in this format:
 * {
 *   "enableLogin": false,          // Current active value
 *   "csrfDisabled": true,
 *   "_pending": {                  // Optional - only present if there are pending changes
 *     "enableLogin": true          // Value that will be active after restart
 *   }
 * }
 */

export interface SettingsWithPending<T = any> {
  _pending?: Partial<T>;
  [key: string]: any;
}

/**
 * Merge pending changes into the settings object.
 * Returns a new object with pending values overlaid on top of current values.
 *
 * @param settings Settings object from backend (may contain _pending block)
 * @returns Merged settings with pending values applied
 */
export function mergePendingSettings<T extends SettingsWithPending>(settings: T): Omit<T, '_pending'> {
  if (!settings || !settings._pending) {
    // No pending changes, return as-is (without _pending property)
    const { _pending, ...rest } = settings || {};
    return rest as Omit<T, '_pending'>;
  }

  // Deep merge pending changes
  const merged = deepMerge(settings, settings._pending);

  // Remove _pending from result
  const { _pending, ...result } = merged;
  return result as Omit<T, '_pending'>;
}

/**
 * Check if a specific field has a pending change awaiting restart.
 *
 * @param settings Settings object from backend
 * @param fieldPath Dot-notation path to the field (e.g., "oauth2.clientSecret")
 * @returns True if field has pending changes
 */
export function isFieldPending<T extends SettingsWithPending>(
  settings: T | null | undefined,
  fieldPath: string
): boolean {
  if (!settings?._pending) {
    console.log(`[isFieldPending] No _pending block found for field: ${fieldPath}`);
    return false;
  }

  // Navigate the pending object using dot notation
  const value = getNestedValue(settings._pending, fieldPath);
  const isPending = value !== undefined;

  if (isPending) {
    console.log(`[isFieldPending] Field ${fieldPath} IS pending with value:`, value);
  }

  return isPending;
}

/**
 * Check if there are any pending changes in the settings.
 *
 * @param settings Settings object from backend
 * @returns True if there are any pending changes
 */
export function hasPendingChanges<T extends SettingsWithPending>(
  settings: T | null | undefined
): boolean {
  return settings?._pending !== undefined && Object.keys(settings._pending).length > 0;
}

/**
 * Get the pending value for a specific field, or undefined if no pending change.
 *
 * @param settings Settings object from backend
 * @param fieldPath Dot-notation path to the field
 * @returns Pending value or undefined
 */
export function getPendingValue<T extends SettingsWithPending>(
  settings: T | null | undefined,
  fieldPath: string
): any {
  if (!settings?._pending) {
    return undefined;
  }

  return getNestedValue(settings._pending, fieldPath);
}

/**
 * Get the current active value for a field (ignoring pending changes).
 *
 * @param settings Settings object from backend
 * @param fieldPath Dot-notation path to the field
 * @returns Current active value
 */
export function getCurrentValue<T extends SettingsWithPending>(
  settings: T | null | undefined,
  fieldPath: string
): any {
  if (!settings) {
    return undefined;
  }

  // Get from settings, ignoring _pending
  const { _pending, ...activeSettings } = settings;
  return getNestedValue(activeSettings, fieldPath);
}

// ========== Helper Functions ==========

/**
 * Deep merge two objects. Second object takes priority.
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  if (!target) return source;

  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Get nested value using dot notation.
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Check if value is a plain object (not array, not null, not Date, etc.)
 */
function isPlainObject(value: any): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === Object
  );
}
