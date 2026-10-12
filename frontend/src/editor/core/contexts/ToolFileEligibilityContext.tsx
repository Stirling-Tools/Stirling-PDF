import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { FileId, StirlingFile } from "@app/types/fileContext";

type EligibleFileIds = ReadonlySet<FileId> | null;

const EligibleFileIdsContext = createContext<EligibleFileIds>(null);
const RegisterEligibilityContext = createContext<
  (ids: EligibleFileIds) => () => void
>(() => () => {});

/** Shares the mounted tool's eligible files with workbench and sidebar previews. */
export function ToolFileEligibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [eligibleFileIds, setEligibleFileIds] = useState<EligibleFileIds>(null);
  const register = useCallback((ids: EligibleFileIds) => {
    setEligibleFileIds(ids);
    return () =>
      setEligibleFileIds((current) => (current === ids ? null : current));
  }, []);

  return (
    <RegisterEligibilityContext.Provider value={register}>
      <EligibleFileIdsContext.Provider value={eligibleFileIds}>
        {children}
      </EligibleFileIdsContext.Provider>
    </RegisterEligibilityContext.Provider>
  );
}

/** Publishes the Files step's selection until it unmounts; null clears dimming. */
export function ToolFileEligibility({
  files,
}: {
  files: readonly StirlingFile[] | null;
}) {
  const register = useContext(RegisterEligibilityContext);
  useEffect(
    () => register(files && new Set(files.map((file) => file.fileId))),
    [files, register],
  );
  return null;
}

/** Null means no tool selection is active, so file previews should remain undimmed. */
export function useToolEligibleFileIds(): EligibleFileIds {
  return useContext(EligibleFileIdsContext);
}
