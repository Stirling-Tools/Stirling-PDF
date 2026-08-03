import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Stack,
  Text,
  TextInput,
  NumberInput,
  Divider,
  Checkbox,
  Alert,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import { useAllFiles } from "@app/contexts/FileContext";
import SignaturePlacementPicker from "@app/components/tools/certSign/SignaturePlacementPicker";
import SignatureAttributePicker from "@app/components/tools/certSign/SignatureAttributePicker";
import {
  SIGNATURE_PLACEMENT_CANCEL_EVENT,
  SIGNATURE_PLACEMENT_DONE_EVENT,
  SIGNATURE_PLACEMENT_START_EVENT,
  type SignaturePlacementResult,
} from "@app/constants/signaturePlacementEvents";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const SignatureAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();
  const { files, fileStubs } = useAllFiles();
  const [isPlacing, setIsPlacing] = useState(false);

  const selectedFile = useMemo(() => (files.length > 0 ? files[0] : null), [files]);
  const selectedStub = useMemo(
    () => (fileStubs.length > 0 ? fileStubs[0] : null),
    [fileStubs],
  );

  const startPlacement = useCallback(() => {
    setIsPlacing(true);
    window.dispatchEvent(new CustomEvent(SIGNATURE_PLACEMENT_START_EVENT));
  }, []);

  const cancelPlacement = useCallback(() => {
    setIsPlacing(false);
    window.dispatchEvent(new CustomEvent(SIGNATURE_PLACEMENT_CANCEL_EVENT));
  }, []);

  // The page the box was drawn on becomes the signed page: having dragged a box onto
  // page 5 and then signed page 1 would be a surprise, and the box is the more
  // deliberate of the two choices.
  useEffect(() => {
    const onDone = (event: Event) => {
      const { detail } = event as CustomEvent<SignaturePlacementResult>;
      if (!detail) return;
      setIsPlacing(false);
      onParameterChange("signatureArea", detail.area);
      onParameterChange("pageNumber", detail.pageNumber);
    };
    const onCancel = () => setIsPlacing(false);

    window.addEventListener(SIGNATURE_PLACEMENT_DONE_EVENT, onDone);
    window.addEventListener(SIGNATURE_PLACEMENT_CANCEL_EVENT, onCancel);
    return () => {
      window.removeEventListener(SIGNATURE_PLACEMENT_DONE_EVENT, onDone);
      window.removeEventListener(SIGNATURE_PLACEMENT_CANCEL_EVENT, onCancel);
    };
  }, [onParameterChange]);

  // Leaving the panel mid-drag would strand the viewer in placement mode with no way
  // back, since the button that cancels it has gone.
  useEffect(() => cancelPlacement, [cancelPlacement]);

  return (
    <Stack gap="md">
      {/* Signature Visibility */}
      <Stack gap="sm">
        <div style={{ display: "flex", gap: "4px" }}>
          <Button
            accent={!parameters.showSignature ? "default" : "neutral"}
            variant={!parameters.showSignature ? "primary" : "secondary"}
            onClick={() => onParameterChange("showSignature", false)}
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
          <NumberInput
            label={t("certSign.pageNumber", "Page Number")}
            value={parameters.pageNumber}
            onChange={(value) => onParameterChange("pageNumber", value || 1)}
            min={1}
            disabled={disabled}
          />
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

          <Divider />

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("certSign.placement.title", "Signature position")}
            </Text>

            <Button
              variant={isPlacing ? "primary" : "secondary"}
              accent={isPlacing ? "brand" : "neutral"}
              onClick={isPlacing ? cancelPlacement : startPlacement}
              disabled={disabled}
            >
              {isPlacing
                ? t("certSign.placement.cancel", "Cancel — press Esc")
                : t("certSign.placement.draw", "Draw the box on the document")}
            </Button>

            <Text size="xs" c="dimmed">
              {isPlacing
                ? t(
                    "certSign.placement.dragging",
                    "Drag a box on the page where the signature should go.",
                  )
                : parameters.signatureArea
                  ? t("certSign.placement.placed", {
                      defaultValue:
                        "Placed on page {{page}} · {{width}} × {{height}} pt",
                      page: parameters.pageNumber,
                      width: Math.round(parameters.signatureArea.width),
                      height: Math.round(parameters.signatureArea.height),
                    })
                  : t(
                      "certSign.placement.default",
                      "Not placed — the signature goes where it always has, on the page above.",
                    )}
            </Text>

            {parameters.signatureArea && !isPlacing && (
              <Button
                variant="tertiary"
                accent="neutral"
                disabled={disabled}
                onClick={() => onParameterChange("signatureArea", undefined)}
              >
                {t("certSign.placement.reset", "Use the default position")}
              </Button>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Checkbox
              label={t(
                "certSign.markAllPages.label",
                "Repeat it on every page",
              )}
              checked={parameters.markAllPages}
              onChange={(event) =>
                onParameterChange("markAllPages", event.currentTarget.checked)
              }
              disabled={disabled || !parameters.signatureArea}
            />
            {!parameters.signatureArea && (
              <Text size="xs" c="dimmed">
                {t(
                  "certSign.markAllPages.needsBox",
                  "Draw the box first, so there is a shape to repeat.",
                )}
              </Text>
            )}
            {parameters.markAllPages && (
              <Alert color="yellow" variant="light" p="xs">
                <Text size="xs">
                  {t(
                    "certSign.markAllPages.warning",
                    "A PDF can only be signed in one place. The other pages get a matching mark that looks the same but is not a signature.",
                  )}
                </Text>
              </Alert>
            )}
          </Stack>

          {/* The page thumbnail is only useful when the same position repeats on every
              page; for a single page the user places the box on the document itself. */}
          {parameters.markAllPages && (
            <>
              <Divider />
              <SignaturePlacementPicker
                file={selectedFile}
                fileStub={selectedStub}
                thumbnailUrl={selectedStub?.thumbnailUrl ?? null}
                pageNumber={parameters.pageNumber}
                signatureArea={parameters.signatureArea}
                onSignatureAreaChange={(area) =>
                  onParameterChange("signatureArea", area)
                }
                disabled={disabled}
              />
            </>
          )}

          <Divider />

          <SignatureAttributePicker
            selected={parameters.visibleAttributes}
            onChange={(selected) =>
              onParameterChange("visibleAttributes", selected)
            }
            disabled={disabled}
          />
        </Stack>
      )}
    </Stack>
  );
};

export default SignatureAppearanceSettings;
