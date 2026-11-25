import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSignature } from "@editor/contexts/SignatureContext";
import { useNavigation } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useSignatureFieldPicker } from "@editor/contexts/SignatureFieldPickerContext";
import { DEFAULT_PARAMETERS as SIGN_DEFAULTS } from "@editor/hooks/tools/sign/useSignParameters";
import type { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import { stampLabels } from "@editor/hooks/tools/certSign/useCertSignOperation";
import { useSignatureLogo } from "@editor/hooks/tools/certSign/useSignatureLogo";
import { useImageFile } from "@editor/hooks/tools/certSign/useImageFile";
import { getServerSigningCertificate } from "@editor/services/hardwareSigningService";
import {
  DEFAULT_STAMP_SIZE,
  renderStampPreview,
  stampDetails,
} from "@editor/services/signatureStampPreview";
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
  preview: string | null;
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

function useServerSignerName(serverSigning: boolean): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!serverSigning) return;
    let cancelled = false;
    getServerSigningCertificate().then((cert) => {
      if (!cancelled) setName(cert?.subjectCommonName || null);
    });
    return () => {
      cancelled = true;
    };
  }, [serverSigning]);
  return name;
}

type StampRenderer = (width: number, height: number) => string | null;

/**
 * Draws the stamp as the server will, at a given size in points, for the placement guide.
 */
function useStampRenderer(parameters: CertSignParameters): StampRenderer {
  const { t } = useTranslation();
  const logo = useSignatureLogo();
  const image = useImageFile(parameters.signatureImage ?? null);
  const serverName = useServerSignerName(parameters.signMode === "AUTO");
  const signer =
    serverName ?? t("certSign.appearance.placement.yourName", "Your name");
  const { stampGraphic, showWatermark } = parameters;
  const { reason, location } = parameters;

  return useMemo(() => {
    const content = {
      name: signer,
      details: stampDetails(stampLabels(t), {
        name: signer,
        date: new Date(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reason,
        location,
      }),
      graphic: stampGraphic,
      image,
      watermark: showWatermark ? (logo?.image ?? null) : null,
    };
    return (width: number, height: number) =>
      renderStampPreview(content, width, height);
  }, [t, signer, reason, location, stampGraphic, image, showWatermark, logo]);
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
  const { activeFileId, setActiveFileId, scrollActions } = useViewer();
  const layout = useSignatureLayout(
    active && parameters.showSignature ? file : null,
  );

  const [armed, setArmed] = useState(false);
  const [stampId, setStampId] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const wasCleanBeforePlacing = useRef(false);
  const offeredFieldFor = useRef<SignatureLayout | null>(null);

  const placingActive = parameters.showSignature && !parameters.fieldName;
  const renderStamp = useStampRenderer(parameters);
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
        signatureApiRef.current?.discardAnnotation(entry.id, entry.pageIndex);
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
    const previewImage = renderStamp(
      DEFAULT_STAMP_SIZE.width,
      DEFAULT_STAMP_SIZE.height,
    );
    setSignatureConfig({
      ...SIGN_DEFAULTS,
      ...(previewImage
        ? { signatureType: "image", signatureData: previewImage }
        : { signatureType: "text" }),
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
    renderStamp,
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

  const { setPick } = useSignatureFieldPicker();
  const emptyFields = useMemo(() => layout?.emptyFields ?? [], [layout]);
  const fieldName = parameters.fieldName ?? null;
  const chosenField = emptyFields.find((field) => field.name === fieldName);
  const stampBox = parameters.stampBox;
  const fieldPreview = useMemo(
    () =>
      chosenField
        ? renderStamp(chosenField.box.width, chosenField.box.height)
        : null,
    [chosenField, renderStamp],
  );
  const preview = useMemo(
    () =>
      fieldPreview ??
      renderStamp(
        stampBox?.width ?? DEFAULT_STAMP_SIZE.width,
        stampBox?.height ?? DEFAULT_STAMP_SIZE.height,
      ),
    [fieldPreview, stampBox, renderStamp],
  );
  const chosenOnPage = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !parameters.showSignature || emptyFields.length === 0) {
      setPick(null);
      return;
    }
    setPick({
      fieldNames: new Set(emptyFields.map((field) => field.name)),
      selected: fieldName,
      preview: fieldPreview,
      choose: (name) => {
        chosenOnPage.current = name;
        onParameterChange("fieldName", name);
      },
    });
  }, [
    active,
    parameters.showSignature,
    emptyFields,
    fieldName,
    fieldPreview,
    onParameterChange,
    setPick,
  ]);
  useEffect(() => () => setPick(null), [setPick]);

  const shownField = useRef<string | null>(null);
  useEffect(() => {
    if (!chosenField || shownField.current === chosenField.name) return;
    const first = shownField.current === null;
    const fromPage = chosenOnPage.current === chosenField.name;
    shownField.current = chosenField.name;
    chosenOnPage.current = null;
    if (first || fromPage) return;
    if (file && activeFileId !== file.fileId) setActiveFileId(file.fileId);
    setWorkbench("viewer");
    scrollActions.scrollToPage(chosenField.pageIndex + 1);
  }, [
    chosenField,
    file,
    activeFileId,
    setActiveFileId,
    setWorkbench,
    scrollActions,
  ]);

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
    preview,
  };
}
