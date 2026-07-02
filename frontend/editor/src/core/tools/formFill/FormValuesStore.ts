/**
 * FormValuesStore — external store for form field values (outside React state).
 *
 * Kept dependency-free (no React, no providers) so it can be unit-tested in
 * isolation and imported without pulling in the pdfium/PDFBox providers.
 *
 * This avoids triggering full context re-renders on every keystroke. Components
 * subscribe per-field via useSyncExternalStore, so only the widget being edited
 * re-renders.
 */

export type Listener = () => void;

export class FormValuesStore {
  private _fieldListeners = new Map<string, Set<Listener>>();
  private _globalListeners = new Set<Listener>();

  private _values: Record<string, string> = {};

  get values(): Record<string, string> {
    return this._values;
  }

  private _version = 0;

  get version(): number {
    return this._version;
  }

  getValue(fieldName: string): string {
    return this._values[fieldName] ?? "";
  }

  setValue(fieldName: string, value: string): void {
    if (this._values[fieldName] === value) return;
    // Copy-on-write: replace the object so getSnapshot() returns a new reference and
    // useSyncExternalStore detects the change (global subscribers like the progress counter
    // bail out if the reference is mutated in place).
    this._values = { ...this._values, [fieldName]: value };
    this._version++;
    this._fieldListeners.get(fieldName)?.forEach((l) => l());
    this._globalListeners.forEach((l) => l());
  }

  /** Replace all values (e.g., on fetch or reset) */
  reset(values: Record<string, string> = {}): void {
    this._values = values;
    this._version++;
    for (const listeners of this._fieldListeners.values()) {
      listeners.forEach((l) => l());
    }
    this._globalListeners.forEach((l) => l());
  }

  /** Subscribe to a single field's value changes */
  subscribeField(fieldName: string, listener: Listener): () => void {
    if (!this._fieldListeners.has(fieldName)) {
      this._fieldListeners.set(fieldName, new Set());
    }
    this._fieldListeners.get(fieldName)!.add(listener);
    return () => {
      this._fieldListeners.get(fieldName)?.delete(listener);
    };
  }

  /** Subscribe to any value change */
  subscribeGlobal(listener: Listener): () => void {
    this._globalListeners.add(listener);
    return () => {
      this._globalListeners.delete(listener);
    };
  }
}
