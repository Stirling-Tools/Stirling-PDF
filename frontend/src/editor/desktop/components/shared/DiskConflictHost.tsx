import { useEffect, useState } from "react";

import { DiskConflictModal } from "@app/components/shared/DiskConflictModal";
import {
  DiskConflictRequest,
  resolveDiskConflict,
  subscribeDiskConflicts,
} from "@app/services/diskConflictPrompt";

/** Renders the conflict modal for whatever the hydration path has queued.
 *  Mounted once, desktop-side; renders nothing while the queue is empty. */
export function DiskConflictHost() {
  const [queue, setQueue] = useState<DiskConflictRequest[]>([]);

  useEffect(() => subscribeDiskConflicts(setQueue), []);

  const current = queue[0];
  return (
    <DiskConflictModal
      opened={Boolean(current)}
      fileName={current?.name}
      remainingCount={Math.max(0, queue.length - 1)}
      onKeepMine={() => resolveDiskConflict("mine")}
      onUseDisk={() => resolveDiskConflict("disk")}
    />
  );
}
