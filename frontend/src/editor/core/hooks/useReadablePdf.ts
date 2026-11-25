import { useEffect, useMemo } from "react";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { useRightsManagedPdf } from "@editor/hooks/useRightsManagedPdf";
import { openWithOnlyConnectedAccount } from "@editor/services/rightsManagedPdf";

export interface ReadablePdf {
  file: File;
  password?: string;
}

export function useReadablePdf(
  file: File | null | undefined,
): ReadablePdf | null {
  const rightsManaged = useRightsManagedPdf(file);
  const access = usePdfAccess(file);
  const plaintext =
    rightsManaged.status === "opened" ? rightsManaged.opened.plaintext : null;
  const readAsStored = rightsManaged.status === "none";
  const locked = rightsManaged.status === "locked";
  const password = access?.encrypted ? access.password : undefined;

  useEffect(() => {
    if (locked && file) void openWithOnlyConnectedAccount(file);
  }, [locked, file]);

  return useMemo(() => {
    if (plaintext) return { file: plaintext };
    if (!file || !readAsStored) return null;
    return { file, password };
  }, [file, plaintext, readAsStored, password]);
}
