import { useCallback, useEffect, useMemo, useRef } from "react";
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

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
  /** PDF being signed; enables interactive widget placement on the workbench viewer. */
  pdfFile?: File | null;
}

/**
 * Placeholder graphic for certificate placement ghosts / overlays.
 * SignaturePreviewLayer requires an image data URL; the real appearance is drawn by the backend.
 */
const CERT_PLACEMENT_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <rect width="200" height="50" rx="4" fill="rgb(0,122,204)" fill-opacity="0.12" stroke="rgb(0,122,204)" stroke-width="2"/>
      <text x="100" y="30" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="rgb(0,122,204)">Digital signature</text>
    </svg>`,
  );

function rectToPreview(rect: CertAppearanceRect): SignaturePreview {
  return {
    id: "cert-appearance-rect",
    pageIndex: rect.pageIndex,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    signatureData: CERT_PLACEMENT_PLACEHOLDER,
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

  // Controlled preview list: at most one box (cert widgets are single-valued).
  const signaturePreviews = useMemo(() => {
    if (!parameters.certAppearanceRect) return [];
    return [rectToPreview(parameters.certAppearanceRect)];
  }, [parameters.certAppearanceRect]);

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
  useEffect(() => {
    if (!placementActive || !pdfFile) {
      setOverlay(null);
      return;
    }

    setWorkbench("viewer");
    setOverlay({
      file: pdfFile,
      signaturePreviews,
      signaturePlacementMode: true,
      signaturePlacementData: CERT_PLACEMENT_PLACEHOLDER,
      signaturePlacementType: "image",
      onSignaturePreviewsChange: handlePreviewsChange,
      signatureOverlayApiRef: overlayApiRef,
    });
  }, [
    placementActive,
    pdfFile,
    signaturePreviews,
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
                    "Signature box placed on page {{page}}. Drag or resize it on the PDF, or clear it to use the default corner position.",
                    { page: parameters.certAppearanceRect.pageIndex + 1 },
                  )
                : t(
                    "certSign.appearance.placement.hint",
                    "Click on the PDF to place the visible signature box, then drag or resize it. Without a box, only the page number below is used (default corner position).",
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
