/** "other" saves somewhere else: a download, or a Save As on desktop. */
export type SaveChoice = "replace" | "copy" | "other";

export interface SaveChoiceRequest {
  fileName: string;
  copyName: string;
  /** Where the file lives, e.g. "OneDrive" or "Documents". */
  homeName: string;
  /** Label for "other", e.g. "Download instead". */
  otherLabel: string;
  /** Hide "Remember my choice" when the administrator fixed the mode. */
  canRemember: boolean;
}

export interface SaveChoiceResult {
  choice: SaveChoice;
  remember: boolean;
}

type Pending = SaveChoiceRequest & {
  resolve: (result: SaveChoiceResult | null) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Opens the "Ask me" dialog; resolves null when it is dismissed. */
export function requestSaveChoice(
  request: SaveChoiceRequest,
): Promise<SaveChoiceResult | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = { ...request, resolve };
    emit();
  });
}

export function answerSaveChoice(result: SaveChoiceResult | null): void {
  const current = pending;
  pending = null;
  current?.resolve(result);
  emit();
}

export function subscribeSaveChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSaveChoice(): SaveChoiceRequest | null {
  return pending;
}
