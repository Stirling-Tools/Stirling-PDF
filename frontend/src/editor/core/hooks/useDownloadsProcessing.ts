export interface DownloadsProcessing {
  count: number;
  /** Starts the Downloads classification demo after an explicit user action. */
  start: () => void;
}

/** Offers the Downloads demo only on supported platforms before its first run. */
export function useDownloadsProcessing(): DownloadsProcessing | null {
  return null;
}
