import { useCallback, useState } from "react";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import {
  prefitInSlices,
  scanRunsToFit,
  type ScanFitTarget,
} from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

/** Fits any scanned targets in slices first, then dispatches `build()` as one undo step; `busy` while fitting, and nothing dispatches if the document changed meanwhile. */
export function useDispatchAfterScanFit(store: EditorStore) {
  const [busy, setBusy] = useState(false);
  const dispatch = useCallback(
    async (targets: ScanFitTarget[], build: () => Command[]) => {
      const doc = store.document;
      if (!doc) return;
      const unfitted = scanRunsToFit(doc, targets);
      if (unfitted.length > 0) {
        setBusy(true);
        try {
          await prefitInSlices(doc, unfitted);
        } finally {
          setBusy(false);
        }
        if (store.document !== doc) return;
      }
      const cmds = build();
      if (cmds.length === 1) store.dispatch(cmds[0]);
      else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
    },
    [store],
  );
  return { busy, dispatch };
}
