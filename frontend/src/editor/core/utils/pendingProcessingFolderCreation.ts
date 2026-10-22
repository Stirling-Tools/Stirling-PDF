let pending = false;

/** Carries a QAB request to the editor's folder providers across route changes, not reloads. */
export function requestProcessingFolderCreation(): void {
  pending = true;
}

/** True once per request, consumed by the editor when it can render the setup dialog. */
export function consumeProcessingFolderCreationRequest(): boolean {
  const requested = pending;
  pending = false;
  return requested;
}
