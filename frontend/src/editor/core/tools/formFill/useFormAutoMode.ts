import { useEffect, useRef } from "react";
import { useFormFill } from "@editor/tools/formFill/FormFillContext";

/** Chooses Create only after PDFBox has confirmed the current file has no fields. */
export function useFormAutoMode(fileKey: string | null, active: boolean) {
  const { state, mode, setMode, forFileId, activeProviderName, saving } =
    useFormFill();
  const decidedFileRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !active ||
      saving ||
      state.loading ||
      state.error ||
      activeProviderName !== "pdfbox" ||
      !fileKey ||
      forFileId !== fileKey ||
      decidedFileRef.current === fileKey
    )
      return;
    decidedFileRef.current = fileKey;
    if (state.fields.length === 0 && mode === "fill") setMode("create");
  }, [
    active,
    saving,
    state.loading,
    state.error,
    state.fields.length,
    activeProviderName,
    fileKey,
    forFileId,
    mode,
    setMode,
  ]);
}
