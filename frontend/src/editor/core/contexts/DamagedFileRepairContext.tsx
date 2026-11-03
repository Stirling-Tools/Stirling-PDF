import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useRepairOperation } from "@editor/hooks/tools/repair/useRepairOperation";
import { defaultParameters } from "@editor/hooks/tools/repair/useRepairParameters";
import { useFileSelectors } from "@editor/contexts/file/fileHooks";
import { useToolWorkflowData } from "@editor/contexts/ToolWorkflowContext";
import { alert } from "@editor/components/toast";
import type { FileId } from "@editor/types/file";

export interface DamagedFileRepair {
  /** Repairs the file in place: the output replaces it as a new version. */
  repair: (fileId: FileId) => void;
  /** The file being repaired; one runs at a time. */
  repairingFileId: FileId | null;
}

const DamagedFileRepairContext = createContext<DamagedFileRepair | undefined>(
  undefined,
);

/**
 * One Repair runner for every damaged-file action. Mounted once because the operation hook
 * subscribes to the whole file list, which would re-render every card that held its own.
 */
export function DamagedFileRepairProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const operation = useRepairOperation();
  const selectors = useFileSelectors();
  const { toolAvailability } = useToolWorkflowData();
  const [repairing, setRepairing] = useState<{
    id: FileId;
    name: string;
    finished: boolean;
  } | null>(null);

  // Read through refs so repair keeps one identity: memoized sidebar rows receive it.
  const latest = useRef({ repairing, operation, selectors });
  latest.current = { repairing, operation, selectors };
  const repair = useCallback((fileId: FileId) => {
    const { repairing: busy, operation: op, selectors: files } = latest.current;
    if (busy) return;
    const file = files.getFile(fileId);
    if (!file) return;
    setRepairing({ id: fileId, name: file.name, finished: false });
    void op
      .executeOperation(defaultParameters, [file])
      .finally(() =>
        setRepairing((current) =>
          current?.id === fileId ? { ...current, finished: true } : current,
        ),
      );
  }, []);

  // Read after the run's state has rendered; a rejected file can end without an error message.
  useEffect(() => {
    if (!repairing?.finished) return;
    if (operation.outputFileIds?.length) {
      alert({
        alertType: "success",
        title: t("damagedPdf.repaired", "Repaired {{name}}", {
          name: repairing.name,
        }),
        expandable: false,
        durationMs: 3000,
      });
    } else {
      alert({
        alertType: "error",
        title: t("damagedPdf.repairFailed", "Couldn't repair {{name}}", {
          name: repairing.name,
        }),
        body: operation.errorMessage ?? undefined,
        expandable: false,
        durationMs: 6000,
      });
    }
    operation.resetResults();
    setRepairing(null);
  }, [repairing, operation, t]);

  const available = toolAvailability.repair?.available !== false;
  const value = useMemo(
    () =>
      available
        ? { repair, repairingFileId: repairing?.id ?? null }
        : undefined,
    [available, repair, repairing?.id],
  );

  return (
    <DamagedFileRepairContext.Provider value={value}>
      {children}
    </DamagedFileRepairContext.Provider>
  );
}

/** Undefined when the server has Repair disabled, so callers hide the action. */
export function useDamagedFileRepair(): DamagedFileRepair | undefined {
  return useContext(DamagedFileRepairContext);
}
