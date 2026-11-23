import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSignature } from "@editor/contexts/SignatureContext";
import { useNavigation } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { DEFAULT_PARAMETERS as SIGN_DEFAULTS } from "@editor/hooks/tools/sign/useSignParameters";
import type { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import {
  readSignatureLayout,
  viewerRectToPdfBox,
  type SignatureLayout,
} from "@editor/services/signatureFieldLayout";
import type { StirlingFile } from "@editor/types/fileContext";

type ParameterChange = <K extends keyof CertSignParameters>(
  key: K,
  value: CertSignParameters[K],
) => void;

interface StampPlacementOptions {
  file: StirlingFile | null;
  parameters: CertSignParameters;
  onParameterChange: ParameterChange;
  /** False while results are shown: any parameter write would reset them. */
  active: boolean;
}

export interface CertSignStampPlacement {
  layout: SignatureLayout | null;
  placing: boolean;
  placedPage: number | null;
  place: () => void;
  remove: () => void;
}

function useSignatureLayout(file: StirlingFile | null) {
  const [layout, setLayout] = useState<SignatureLayout | null>(null);
  useEffect(() => {
    setLayout(null);
    if (!file) return;
    let cancelled = false;
    file
      .arrayBuffer()
      .then(readSignatureLayout)
      .then((next) => {
        if (!cancelled) setLayout(next);
      })
      .catch((error) => {
        console.warn("Could not read signature fields:", error);
        if (!cancelled) setLayout({ emptyFields: [], cropBoxes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  return layout;
}

/**
 * Lets the user place the visible signature box with the Sign tool's stamp placement, and offers
 * the file's empty signature fields. The placed stamp lives only in the viewer as a guide; it is
 * removed when placement is abandoned, so the signed file never contains it.
 */
export function useCertSignStampPlacement({
  file,
  parameters,
  onParameterChange,
  active,
}: StampPlacementOptions): CertSignStampPlacement {
  const { t } = useTranslation();
  const {
    signatureConfig,
    setSignatureConfig,
    activateSignaturePlacementMode,
    deactivateDrawMode,
    isPlacementMode,
    isSignatureApiReady,
    placedSignatures,
    signatureApiRef,
    setSignaturesApplied,
  } = useSignature();
  const { hasUnsavedChanges, setWorkbench } = useNavigation();
  const { activeFileId, setActiveFileId } = useViewer();
  const layout = useSignatureLayout(
    active && parameters.showSignature ? file : null,
  );

  const [armed, setArmed] = useState(false);
  const [stampId, setStampId] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const wasCleanBeforePlacing = useRef(false);
  const offeredFieldFor = useRef<SignatureLayout | null>(null);

  const placingActive = parameters.showSignature && !parameters.fieldName;
  const stamp = placedSignatures.find((entry) => entry.id === stampId) ?? null;

  const previewLabel = parameters.name
    ? t("certSign.appearance.placement.previewNamed", "Signed by {{name}}", {
        name: parameters.name,
      })
    : t("certSign.appearance.placement.preview", "Digital signature");

  useEffect(() => {
    if (!layout || offeredFieldFor.current === layout) return;
    offeredFieldFor.current = layout;
    const names = layout.emptyFields.map((field) => field.name);
    if (parameters.fieldName && !names.includes(parameters.fieldName)) {
      onParameterChange("fieldName", undefined);
    } else if (!parameters.fieldName && !stampId && names.length > 0) {
      onParameterChange("fieldName", names[0]);
    }
  }, [layout, parameters.fieldName, stampId, onParameterChange]);

  const remove = useCallback(() => {
    setArmed(false);
    if (isPlacementMode) deactivateDrawMode();
    const ours = placedSignatures.filter(
      (entry) =>
        entry.id === stampId || (armed && !knownIds.current.has(entry.id)),
    );
    if (stampId || ours.length > 0) {
      for (const entry of ours) {
        signatureApiRef.current?.deleteAnnotation(entry.id, entry.pageIndex);
      }
      if (wasCleanBeforePlacing.current) setSignaturesApplied(true);
    }
    setStampId(null);
    onParameterChange("stampBox", undefined);
  }, [
    armed,
    isPlacementMode,
    deactivateDrawMode,
    placedSignatures,
    stampId,
    signatureApiRef,
    setSignaturesApplied,
    onParameterChange,
  ]);

  const place = useCallback(() => {
    if (stampId) remove();
    knownIds.current = new Set(placedSignatures.map((entry) => entry.id));
    wasCleanBeforePlacing.current = !hasUnsavedChanges;
    if (file && activeFileId !== file.fileId) setActiveFileId(file.fileId);
    setWorkbench("viewer");
    setSignatureConfig({
      ...SIGN_DEFAULTS,
      signatureType: "text",
      signerName: previewLabel,
    });
    setArmed(true);
  }, [
    stampId,
    remove,
    placedSignatures,
    hasUnsavedChanges,
    file,
    activeFileId,
    setActiveFileId,
    setWorkbench,
    setSignatureConfig,
    previewLabel,
  ]);

  useEffect(() => {
    if (
      armed &&
      isSignatureApiReady &&
      !isPlacementMode &&
      signatureConfig?.signerName === previewLabel
    ) {
      activateSignaturePlacementMode();
    }
  }, [
    armed,
    isSignatureApiReady,
    isPlacementMode,
    signatureConfig,
    previewLabel,
    activateSignaturePlacementMode,
  ]);

  useEffect(() => {
    if (!armed) return;
    const fresh = placedSignatures.filter(
      (entry) => !knownIds.current.has(entry.id),
    );
    if (fresh.length === 0) return;
    setStampId(fresh[fresh.length - 1].id);
    setArmed(false);
    deactivateDrawMode();
  }, [armed, placedSignatures, deactivateDrawMode]);

  useEffect(() => {
    if (!stampId || stamp) return;
    setStampId(null);
    if (active) onParameterChange("stampBox", undefined);
  }, [stampId, stamp, active, onParameterChange]);

  const stampPage = stamp?.pageIndex;
  const rect = stamp?.rect;
  const cropBox =
    stampPage === undefined ? undefined : layout?.cropBoxes[stampPage];
  useEffect(() => {
    if (!active || stampPage === undefined || !rect || !cropBox) return;
    onParameterChange(
      "stampBox",
      viewerRectToPdfBox(
        {
          x: rect.origin.x,
          y: rect.origin.y,
          width: rect.size.width,
          height: rect.size.height,
        },
        cropBox,
      ),
    );
    onParameterChange("pageNumber", stampPage + 1);
  }, [active, stampPage, rect, cropBox, onParameterChange]);

  const removeRef = useRef(remove);
  removeRef.current = remove;
  useEffect(() => {
    if (active && !placingActive) removeRef.current();
  }, [active, placingActive]);
  useEffect(
    () => () => {
      removeRef.current();
      setSignatureConfig(null);
    },
    [setSignatureConfig],
  );

  return {
    layout,
    placing: armed,
    placedPage: stampPage === undefined ? null : stampPage + 1,
    place,
    remove,
  };
}
