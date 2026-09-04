import React from "react";
import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";

interface DocumentReadyWrapperProps {
  children: (documentId: string) => React.ReactNode;
  fallback?: React.ReactNode;
}

export function DocumentReadyWrapper({
  children,
  fallback = null,
}: DocumentReadyWrapperProps) {
  const { activeDocumentId, activeDocument } = useActiveDocument();
  if (
    !activeDocumentId ||
    activeDocument?.status !== "loaded" ||
    !activeDocument?.document
  ) {
    return <>{fallback}</>;
  }
  return <>{children(activeDocumentId)}</>;
}
