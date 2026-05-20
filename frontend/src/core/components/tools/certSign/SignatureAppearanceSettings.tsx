import { useMemo } from "react";
import { Stack, Text, Button, TextInput, NumberInput, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import { LocalEmbedPDFWithAnnotations } from "@app/components/viewer/LocalEmbedPDFWithAnnotations";
import type { SignaturePreview } from "@app/components/viewer/LocalEmbedPDFWithAnnotations";

const TRANSPARENT_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
  /** PDF to place the visible signature widget on (first selected file). */
  pdfFile?: File | null;
}

const SignatureAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  pdfFile = null,
}: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();

  const initialCertPreviews = useMemo((): SignaturePreview[] => {
    const r = parameters.certAppearanceRect;
    if (!r) return [];
    return [
      {
        id: "cert-appearance-ui",
        pageIndex: r.pageIndex,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        signatureData: TRANSPARENT_PIXEL_PNG,
        signatureType: "image",
        kind: "certificate",
      },
    ];
  }, [parameters.certAppearanceRect]);

  const handleCertAnnotations = (previews: SignaturePreview[]) => {
    if (previews.length === 0) {
      onParameterChange("certAppearanceRect", null);
      return;
    }
    const p = previews[0];
    if (p.kind !== "certificate") return;
    onParameterChange("certAppearanceRect", {
      pageIndex: p.pageIndex,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    });
    onParameterChange("pageNumber", p.pageIndex + 1);
  };

  return (
    <Stack gap="md">
      {/* Signature Visibility */}
      <Stack gap="sm">
        <div style={{ display: "flex", gap: "4px" }}>
          <Button
            variant={!parameters.showSignature ? "filled" : "outline"}
            color={!parameters.showSignature ? "blue" : "var(--text-muted)"}
            onClick={() => {
              onParameterChange("showSignature", false);
              onParameterChange("certAppearanceRect", null);
            }}
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
            variant={parameters.showSignature ? "filled" : "outline"}
            color={parameters.showSignature ? "blue" : "var(--text-muted)"}
            onClick={() => onParameterChange("showSignature", true)}
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
            <>
              <Text size="sm" c="dimmed">
                {t(
                  "certSign.appearance.placementHint",
                  "Click the page to place the signature box, then drag or resize it. Page number updates from the page you use.",
                )}
              </Text>
              <Box
                style={{
                  height: 420,
                  minHeight: 280,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <LocalEmbedPDFWithAnnotations
                  key={`${pdfFile.name}-${pdfFile.size}`}
                  file={pdfFile}
                  placementMode={!disabled}
                  placementAppearance="certificate"
                  maxSignaturePreviews={1}
                  initialSignatures={initialCertPreviews}
                  onAnnotationChange={handleCertAnnotations}
                />
              </Box>
              {parameters.certAppearanceRect ? (
                <Text size="sm">
                  {t("certSign.appearance.pageFromPlacement", "Signing page")}:{" "}
                  {parameters.certAppearanceRect.pageIndex + 1}
                </Text>
              ) : (
                <>
                  <Text size="sm" c="dimmed">
                    {t(
                      "certSign.appearance.placeOrDefault",
                      "Place a box on the PDF for a custom position and size, or set only the page below to use the default corner widget.",
                    )}
                  </Text>
                  <NumberInput
                    label={t("certSign.pageNumber", "Page Number")}
                    value={parameters.pageNumber}
                    onChange={(value) =>
                      onParameterChange("pageNumber", value || 1)
                    }
                    min={1}
                    disabled={disabled}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <NumberInput
                label={t("certSign.pageNumber", "Page Number")}
                value={parameters.pageNumber}
                onChange={(value) => onParameterChange("pageNumber", value || 1)}
                min={1}
                disabled={disabled}
              />
              <Text size="xs" c="dimmed">
                {t(
                  "certSign.appearance.legacyPlacement",
                  "Select a PDF in the first step to place the visible signature interactively. Without a file, the default corner placement and this page number are used.",
                )}
              </Text>
            </>
          )}
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("certSign.logoTitle", "Logo")}
            </Text>
            <div style={{ display: "flex", gap: "4px" }}>
              <Button
                variant={!parameters.showLogo ? "filled" : "outline"}
                color={!parameters.showLogo ? "blue" : "var(--text-muted)"}
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
                variant={parameters.showLogo ? "filled" : "outline"}
                color={parameters.showLogo ? "blue" : "var(--text-muted)"}
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
