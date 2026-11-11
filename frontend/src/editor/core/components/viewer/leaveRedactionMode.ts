export interface RedactionModeExit {
  isRedactActive: () => boolean;
  endRedact: () => void;
}

/**
 * Leaves redaction mode only when redaction actually owns the viewer-global
 * interaction mode. The plugin's endRedact is a bare activateDefaultMode(), so calling
 * it unconditionally also cancels whatever else is active, such as Pan.
 *
 * Safe to call while the document is being torn down: capability failures are
 * swallowed after a warning.
 */
export function leaveRedactionMode(
  redaction: RedactionModeExit | null | undefined,
): void {
  try {
    if (redaction?.isRedactActive()) {
      redaction.endRedact();
    }
  } catch (error) {
    console.warn("Failed to leave redaction mode:", error);
  }
}
