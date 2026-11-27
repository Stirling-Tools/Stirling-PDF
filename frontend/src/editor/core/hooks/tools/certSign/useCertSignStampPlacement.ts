import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useOfferSignatureFields } from "@editor/hooks/signing/useOfferSignatureFields";
import {
  useSignatureFieldPicker,
  type StampGuideRect,
} from "@editor/contexts/SignatureFieldPickerContext";
import type { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import { stampLabels } from "@editor/hooks/tools/certSign/useCertSignOperation";
import { useSignatureLogo } from "@editor/hooks/tools/certSign/useSignatureLogo";
import { useImageFile } from "@editor/hooks/tools/certSign/useImageFile";
import {
  getServerSigningCertificate,
  type HardwareCertificateInfo,
} from "@editor/services/hardwareSigningService";
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
  deviceCertificate: HardwareCertificateInfo | null;
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

interface Signer {
  name: string | null;
  subject: string | null;
}

function signerOf(cert: HardwareCertificateInfo): Signer {
  return {
    name: cert.subjectCommonName || null,
    subject: cert.displaySubject || null,
  };
}

function useServerSigner(serverSigning: boolean): Signer | null {
  const [signer, setSigner] = useState<Signer | null>(null);
  useEffect(() => {
    setSigner(null);
    if (!serverSigning) return;
    let cancelled = false;
    getServerSigningCertificate().then((cert) => {
      if (!cancelled && cert) setSigner(signerOf(cert));
    });
    return () => {
      cancelled = true;
    };
  }, [serverSigning]);
  return signer;
}

type StampRenderer = (width: number, height: number) => string | null;

/**
 * Draws the stamp as the server will, at a given size in points, for the placement guide.
 */
function useStampRenderer(
  parameters: CertSignParameters,
  deviceCertificate: HardwareCertificateInfo | null,
): StampRenderer {
  const { t } = useTranslation();
  const logo = useSignatureLogo();
  const image = useImageFile(parameters.signatureImage ?? null);
  const server = useServerSigner(parameters.signMode === "AUTO");
  const device =
    parameters.signMode === "DEVICE" &&
    deviceCertificate &&
    deviceCertificate.alias === parameters.alias
      ? signerOf(deviceCertificate)
      : null;
  const certificate = server ?? device;
  const holder =
    certificate?.name ||
    t("certSign.appearance.placement.yourName", "Your name");
  const signer = parameters.name.trim() || holder;
  const subject = parameters.showCertificateDetails
    ? (certificate?.subject ??
      t(
        "certSign.appearance.placement.yourSubject",
        "CN=Your name, O=Your organisation",
      ))
    : null;
  const { stampGraphic, showWatermark } = parameters;
  const { reason, location } = parameters;

  return useMemo(() => {
    const content = {
      name: signer,
      details: stampDetails(stampLabels(t), {
        name: holder,
        date: new Date(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reason,
        location,
        subject,
      }),
      graphic: stampGraphic,
      image,
      watermark: showWatermark ? (logo?.image ?? null) : null,
    };
    return (width: number, height: number) =>
      renderStampPreview(content, width, height);
  }, [
    t,
    signer,
    holder,
    subject,
    reason,
    location,
    stampGraphic,
    image,
    showWatermark,
    logo,
  ]);
}

/** The stamp at the server's default box size, for showing where no box has been chosen. */
export function useDefaultStampPreview(
  parameters: CertSignParameters,
  deviceCertificate: HardwareCertificateInfo | null,
): string | null {
  const renderStamp = useStampRenderer(parameters, deviceCertificate);
  return useMemo(
    () => renderStamp(DEFAULT_STAMP_SIZE.width, DEFAULT_STAMP_SIZE.height),
    [renderStamp],
  );
}

/**
 * Offers the file's empty signature fields, and lets the user put the visible signature box
 * anywhere on a page instead. The box is drawn over the viewer, never added to the document, so
 * no save can write it into the file.
 */
export function useCertSignStampPlacement({
  file,
  parameters,
  onParameterChange,
  active,
  deviceCertificate,
}: StampPlacementOptions): CertSignStampPlacement {
  const { setWorkbench } = useNavigation();
  const { activeFileId, setActiveFileId } = useViewer();
  const { setGuide } = useSignatureFieldPicker();
  const layout = useSignatureLayout(
    active && parameters.showSignature ? file : null,
  );

  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{
    pageIndex: number;
    rect: StampGuideRect;
  } | null>(null);
  const offeredFieldFor = useRef<SignatureLayout | null>(null);

  const placingActive = parameters.showSignature && !parameters.fieldName;
  const renderStamp = useStampRenderer(parameters, deviceCertificate);

  useEffect(() => {
    if (!layout || offeredFieldFor.current === layout) return;
    offeredFieldFor.current = layout;
    const names = layout.emptyFields.map((field) => field.name);
    if (parameters.fieldName && !names.includes(parameters.fieldName)) {
      onParameterChange("fieldName", undefined);
    } else if (!parameters.fieldName && !placed && names.length > 0) {
      onParameterChange("fieldName", names[0]);
    }
  }, [layout, parameters.fieldName, placed, onParameterChange]);

  const remove = useCallback(() => {
    setPlacing(false);
    setPlaced(null);
    if (active) onParameterChange("stampBox", undefined);
  }, [active, onParameterChange]);

  const place = useCallback(() => {
    if (file && activeFileId !== file.fileId) setActiveFileId(file.fileId);
    setWorkbench("viewer");
    setPlaced(null);
    setPlacing(true);
  }, [file, activeFileId, setActiveFileId, setWorkbench]);

  const moveTo = useCallback(
    (pageIndex: number, rect: StampGuideRect) => {
      setPlacing(false);
      setPlaced({ pageIndex, rect });
      const cropBox = layout?.cropBoxes[pageIndex];
      if (!cropBox) return;
      onParameterChange("stampBox", viewerRectToPdfBox(rect, cropBox));
      onParameterChange("pageNumber", pageIndex + 1);
    },
    [layout, onParameterChange],
  );

  const guideSize = placed?.rect ?? DEFAULT_STAMP_SIZE;
  const guidePreview = useMemo(
    () => renderStamp(guideSize.width, guideSize.height),
    [renderStamp, guideSize.width, guideSize.height],
  );
  const pageSizes = useMemo(
    () =>
      (layout?.cropBoxes ?? []).map((box) => ({
        width: box.width,
        height: box.height,
      })),
    [layout],
  );
  useEffect(() => {
    if (
      !active ||
      !placingActive ||
      !file ||
      !layout ||
      (!placing && !placed)
    ) {
      setGuide(null);
      return;
    }
    setGuide({
      fileId: file.fileId,
      placing,
      pageIndex: placed?.pageIndex ?? null,
      rect: placed?.rect ?? null,
      pageSizes,
      defaultSize: DEFAULT_STAMP_SIZE,
      preview: guidePreview,
      onChange: moveTo,
    });
  }, [
    active,
    placingActive,
    file,
    layout,
    placing,
    placed,
    pageSizes,
    guidePreview,
    moveTo,
    setGuide,
  ]);
  useEffect(() => () => setGuide(null), [setGuide]);

  const fileKey = file?.fileId ?? null;
  const placedFor = useRef(fileKey);
  useEffect(() => {
    if (placedFor.current === fileKey) return;
    placedFor.current = fileKey;
    setPlacing(false);
    setPlaced(null);
  }, [fileKey]);

  useEffect(() => {
    if (active && !placingActive) {
      setPlacing(false);
      setPlaced(null);
    }
  }, [active, placingActive]);

  useEffect(() => {
    if (active && !placed && parameters.stampBox) {
      onParameterChange("stampBox", undefined);
    }
  }, [active, placed, parameters.stampBox, onParameterChange]);

  const stampPage = placed?.pageIndex;

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
  const selectField = useCallback(
    (name: string) => onParameterChange("fieldName", name),
    [onParameterChange],
  );
  useOfferSignatureFields({
    enabled: active && parameters.showSignature,
    file,
    layout,
    selected: fieldName,
    onSelect: selectField,
    preview: fieldPreview,
  });

  return {
    layout,
    placing,
    placedPage: stampPage === undefined ? null : stampPage + 1,
    place,
    remove,
    preview,
  };
}
