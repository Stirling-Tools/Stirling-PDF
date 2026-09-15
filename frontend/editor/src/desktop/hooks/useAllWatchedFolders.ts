import { useAllWatchedFolders as useStoredWatchedFolders } from "@core/hooks/useAllWatchedFolders";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import type { WatchedFolder } from "@app/types/watchedFolders";

/** Legacy watched folders are visible only while connected to an authenticated server. */
export function useAllWatchedFolders(): WatchedFolder[] {
  const folders = useStoredWatchedFolders();
  const enabled = usePoliciesEnabled();
  return enabled ? folders : [];
}
