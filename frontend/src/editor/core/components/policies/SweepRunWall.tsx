export interface FolderSweepWallProps {
  /** The processing record whose runs to watch; absent renders nothing. */
  policyId?: string;
}

/**
 * Core stub for the live sweep wall a working folder raises while its pipeline runs. The
 * real implementation lives at the same path under proprietary/ and shadows this via the
 * @app/* alias cascade.
 */
export function FolderSweepWall(_props: FolderSweepWallProps) {
  return null;
}
