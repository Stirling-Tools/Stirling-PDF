import { useCallback, useEffect, useRef } from "react";
import { Stack, Text, TextInput, NumberInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import {
  CertAppearanceRect,
  CertSignParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import type {
  SignatureOverlayAPI,
  SignaturePreview,
} from "@app/components/viewer/viewerTypes";
import {
  buildCertAppearanceGhostDataUrl,
  CERT_APPEARANCE_ASPECT_RATIO,
} from "@app/components/tools/certSign/certAppearanceGhost";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
  /** PDF being signed; enables interactive widget placement on the workbench viewer. */
  pdfFile?: File | null;
}

function rectToPreview(
  rect: CertAppearanceRect,
  signatureData: string,
): SignaturePreview {
  return {
    id: "cert-appearance-rect",
    pageIndex: rect.pageIndex,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    signatureData,
    signatureType: "image",
    participantName: "Digital signature",
  };
}

const SignatureAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  pdfFile = null,
}: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();
  const { setOverlay } = useSigningOverlay();
  const { actions } = useNavigationActions();
  const setWorkbench = actions.setWorkbench;
  const overlayApiRef = useRef<SignatureOverlayAPI | null>(null);

  const placementActive = parameters.showSignature && !!pdfFile && !disabled;
  // Once a box exists, exit click-to-place (ghost follows cursor only before the first click).
  const hasPlacedBox = parameters.certAppearanceRect != null;
  const ghostName = parameters.name;
  const ghostReason = parameters.reason;
  const ghostLocation = parameters.location;
  const ghostShowLogo = parameters.showLogo;
  // Keep latest rect for ghost refreshes without putting coords in effect deps (drag thrash).
  const placedRectRef = useRef(parameters.certAppearanceRect);
  placedRectRef.current = parameters.certAppearanceRect;

  const handlePreviewsChange = useCallback(
    (previews: SignaturePreview[]) => {
      // Replace-on-place: keep only the newest preview so the API always gets one rect.
      const latest = previews.length > 0 ? previews[previews.length - 1] : null;
      if (!latest) {
        onParameterChange("certAppearanceRect", null);
        return;
      }
      const next: CertAppearanceRect = {
        pageIndex: latest.pageIndex,
        x: latest.x,
        y: latest.y,
        width: latest.width,
        height: latest.height,
      };
      onParameterChange("certAppearanceRect", next);
      // Keep the page NumberInput in sync with the placed page (1-indexed).
      onParameterChange("pageNumber", latest.pageIndex + 1);
    },
    [onParameterChange],
  );

  // Drive the shared workbench viewer (same seam as collab SignRequestPanel).
  // Depend on hasPlacedBox (not rect coordinates) so drag/resize updates params without
  // re-binding the overlay every pointermove — local EmbedPDF state owns the live box.
  // Ghost image *does* rebind when Name / Reason / Location / logo change.
  useEffect(() => {
    if (!placementActive || !pdfFile) {
      setOverlay(null);
      return;
    }

    const ghostDataUrl = buildCertAppearanceGhostDataUrl({
      name: ghostName,
      reason: ghostReason,
      location: ghostLocation,
      showLogo: ghostShowLogo,
    });
    const placed = placedRectRef.current;
    setWorkbench("viewer");
    setOverlay({
      file: pdfFile,
      signaturePreviews:
        hasPlacedBox && placed ? [rectToPreview(placed, ghostDataUrl)] : [],
      // Ghost + click-to-place only until the first box is set; then drag / X to change.
      signaturePlacementMode: !hasPlacedBox,
      signaturePlacementData: ghostDataUrl,
      signaturePlacementType: "image",
      signaturePlacementAspectRatio: CERT_APPEARANCE_ASPECT_RATIO,
      onSignaturePreviewsChange: handlePreviewsChange,
      signatureOverlayApiRef: overlayApiRef,
    });
  }, [
    placementActive,
    pdfFile,
    hasPlacedBox,
    ghostName,
    ghostReason,
    ghostLocation,
    ghostShowLogo,
    handlePreviewsChange,
    setOverlay,
    setWorkbench,
  ]);

  // Clear the overlay when leaving the appearance step / tool.
  useEffect(() => {
    return () => setOverlay(null);
  }, [setOverlay]);

  const handleShowSignatureChange = (visible: boolean) => {
    onParameterChange("showSignature", visible);
    if (!visible) {
      onParameterChange("certAppearanceRect", null);
    }
  };

  return (
    <Stack gap="md">
      {/* Signature Visibility */}
      <Stack gap="sm">
        <div style={{ display: "flex", gap: "4px" }}>
          <Button
            accent={!parameters.showSignature ? "default" : "neutral"}
            variant={!parameters.showSignature ? "primary" : "secondary"}
            onClick={() => handleShowSignatureChange(false)}
            disabled={disabled}
            style={{
              flex: 1,
              height: "auto",
              minHeight: "40px",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                textAlign: "center",
                lineHeight: "1.1",
                fontSize: "11px",
              }}
            >
              {t("certSign.appearance.invisible", "Invisible")}
            </div>
          </Button>
          <Button
            accent={parameters.showSignature ? "default" : "neutral"}
            variant={parameters.showSignature ? "primary" : "secondary"}
            onClick={() => handleShowSignatureChange(true)}
            disabled={disabled}
            style={{
              flex: 1,
              height: "auto",
              minHeight: "40px",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                textAlign: "center",
                lineHeight: "1.1",
                fontSize: "11px",
              }}
            >
              {t("certSign.appearance.visible", "Visible")}
            </div>
          </Button>
        </div>
      </Stack>

      {/* Visible Signature Options */}
      {parameters.showSignature && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {t("certSign.appearance.options.title", "Signature Details")}
          </Text>
          <TextInput
            label={t("certSign.reason", "Reason")}
            value={parameters.reason}
            onChange={(event) =>
              onParameterChange("reason", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("certSign.location", "Location")}
            value={parameters.location}
            onChange={(event) =>
              onParameterChange("location", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("certSign.name", "Name")}
            value={parameters.name}
            onChange={(event) =>
              onParameterChange("name", event.currentTarget.value)
            }
            disabled={disabled}
          />

          {pdfFile ? (
            <Text size="xs" c="dimmed">
              {parameters.certAppearanceRect
                ? t(
                    "certSign.appearance.placement.placed",
                    "Signature box placed on page {{page}}. Drag or resize it on the PDF, or clear / delete it (×) to place again.",
                    { page: parameters.certAppearanceRect.pageIndex + 1 },
                  )
                : t(
                    "certSign.appearance.placement.hint",
                    "Click on the PDF to place the visible signature box. After placing, drag or resize it, or use the × on the box to place again. Without a box, only the page number below is used (default corner position).",
                  )}
            </Text>
          ) : null}

          {parameters.certAppearanceRect ? (
            <Button
              accent="neutral"
              variant="secondary"
              onClick={() => {
                onParameterChange("certAppearanceRect", null);
                overlayApiRef.current?.clearPreviews?.();
              }}
              disabled={disabled}
              style={{ fontSize: "11px" }}
            >
              {t(
                "certSign.appearance.placement.clear",
                "Clear placement (use page number only)",
              )}
            </Button>
          ) : (
            <NumberInput
              label={t("certSign.pageNumber", "Page Number")}
              description={t(
                "certSign.appearance.placement.pageOnly",
                "Used when no signature box is placed — places the default widget at the page corner.",
              )}
              value={parameters.pageNumber}
              onChange={(value) => onParameterChange("pageNumber", value || 1)}
              min={1}
              disabled={disabled}
            />
          )}

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("certSign.logoTitle", "Logo")}
            </Text>
            <div style={{ display: "flex", gap: "4px" }}>
              <Button
                accent={!parameters.showLogo ? "default" : "neutral"}
                variant={!parameters.showLogo ? "primary" : "secondary"}
                onClick={() => onParameterChange("showLogo", false)}
                disabled={disabled}
                style={{
                  flex: 1,
                  height: "auto",
                  minHeight: "40px",
                  fontSize: "11px",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    lineHeight: "1.1",
                    fontSize: "11px",
                  }}
                >
                  {t("certSign.noLogo", "No Logo")}
                </div>
              </Button>
              <Button
                accent={parameters.showLogo ? "default" : "neutral"}
                variant={parameters.showLogo ? "primary" : "secondary"}
                onClick={() => onParameterChange("showLogo", true)}
                disabled={disabled}
                style={{
                  flex: 1,
                  height: "auto",
                  minHeight: "40px",
                  fontSize: "11px",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    lineHeight: "1.1",
                    fontSize: "11px",
                  }}
                >
                  {t("certSign.showLogo", "Show Logo")}
                </div>
              </Button>
            </div>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};

export default SignatureAppearanceSettings;
