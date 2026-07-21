import React, { createContext, useContext, useMemo, useState } from "react";
import type {
  SignaturePreview,
  SignatureOverlayAPI,
} from "@app/components/viewer/viewerTypes";

/** Signing document + signature-overlay props the Shared Signing sidebar tool feeds to the main Workbench Viewer. */
export interface SigningOverlay {
  file: File | null;
  signaturePreviews?: SignaturePreview[];
  signaturePreviewsReadOnly?: boolean;
  signaturePlacementMode?: boolean;
  signaturePlacementData?: string;
  signaturePlacementType?: "canvas" | "image" | "text";
  onSignaturePreviewsChange?: (previews: SignaturePreview[]) => void;
  signatureOverlayApiRef?: React.RefObject<SignatureOverlayAPI | null>;
}

interface SigningOverlayContextValue {
  overlay: SigningOverlay | null;
  setOverlay: React.Dispatch<React.SetStateAction<SigningOverlay | null>>;
}

const SigningOverlayContext = createContext<
  SigningOverlayContextValue | undefined
>(undefined);

export function SigningOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overlay, setOverlay] = useState<SigningOverlay | null>(null);

  const value = useMemo<SigningOverlayContextValue>(
    () => ({ overlay, setOverlay }),
    [overlay],
  );

  return (
    <SigningOverlayContext.Provider value={value}>
      {children}
    </SigningOverlayContext.Provider>
  );
}

export function useSigningOverlay(): SigningOverlayContextValue {
  const ctx = useContext(SigningOverlayContext);
  if (!ctx) {
    throw new Error(
      "useSigningOverlay must be used within a SigningOverlayProvider",
    );
  }
  return ctx;
}
