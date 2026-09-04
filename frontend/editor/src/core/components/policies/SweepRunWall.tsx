export interface FolderSweepWallProps {
  /** The processing record whose runs to watch; absent renders nothing. */
  policyId?: string;
}

/**
 * Core stub for the live sweep wall a working folder raises while its
 * pipeline runs.
 *
 * The real implementation lives in
 * {@code proprietary/components/policies/SweepRunWall.tsx} and shadows this stub via the
 * {@code @app/*} alias cascade. Core builds have no processing folders, so this renders nothing.
 */
export function FolderSweepWall(_props: FolderSweepWallProps) {
  return null;
}
