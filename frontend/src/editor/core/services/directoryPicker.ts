/** Picking a directory on the machine, as a real filesystem path. */

export interface PickedDirectory {
  /** Absolute path, as the platform writes it. */
  path: string;
  /** The directory's own name — the mounted folder's display name. */
  name: string;
}

export const canPickDirectory = false;

/** Ask the user for a directory; null when cancelled (or unsupported). */
export async function pickDirectory(): Promise<PickedDirectory | null> {
  return null;
}
