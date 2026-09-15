import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";

export function useActiveDocumentId(): string | null {
  return useActiveDocument().activeDocumentId;
}

export function useDocumentReady(): boolean {
  const { activeDocumentId, activeDocument } = useActiveDocument();
  return Boolean(
    activeDocumentId &&
    activeDocument?.status === "loaded" &&
    activeDocument?.document,
  );
}
