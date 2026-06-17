import { useTranslation } from "react-i18next";
import { useEffect, useRef, useCallback } from "react";
import { Button, Stack, Text, Divider, ColorInput, Group } from "@mantine/core";
import HighlightAltIcon from "@mui/icons-material/HighlightAlt";
import CropFreeIcon from "@mui/icons-material/CropFree";
import { useRedaction, useRedactionMode } from "@app/contexts/RedactionContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useSignature } from "@app/contexts/SignatureContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";

interface ManualRedactionControlsProps {
  disabled?: boolean;
}

/**
 * ManualRedactionControls provides UI for manual PDF redaction in the tool panel.
 * Displays controls for marking text/areas for redaction and applying them.
 */
export default function ManualRedactionControls({
  disabled = false,
}: ManualRedactionControlsProps) {
  const { t } = useTranslation();

  // Use our RedactionContext which bridges to EmbedPDF
  const {
    activateTextSelection,
    activateMarquee,
    redactionsApplied,
    setActiveType,
    setManualRedactColor,
  } = useRedaction();
  const {
    pendingCount,
    activeType,
    isBridgeReady,
    isRedacting,
    manualRedactColor,
  } = useRedactionMode();

  // Get viewer context to manage annotation mode and save changes
  const { isAnnotationMode, setAnnotationMode, applyChanges, activeFileIndex } =
    useViewer();

  // Get signature context to deactivate annotation tools when switching to redaction
  const { signatureApiRef } = useSignature();

  // Check if user is navigating away (modal shown) — don't fight the save/leave process
  const { showNavigationWarning } = useNavigationGuard();

  // Track the previous file index to detect file switches
  const prevFileIndexRef = useRef<number>(activeFileIndex);

  // Guard: pause auto-reactivation during save/export to avoid interfering with EmbedPDF
  const isSavingRef = useRef(false);

  // Keep a redaction tool active while this component is mounted. If anything
  // deactivates it (annotation tools, file switch, etc.) this re-enables it —
  // defaulting to text selection so "Mark Text" is the initial active mode.
  useEffect(() => {
    if (
      disabled ||
      !isBridgeReady ||
      isSavingRef.current ||
      showNavigationWarning
    )
      return;

    if (!isRedacting || isAnnotationMode) {
      // Kill annotation mode if it stole focus
      if (isAnnotationMode) {
        setAnnotationMode(false);
        if (signatureApiRef?.current) {
          try {
            signatureApiRef.current.deactivateTools();
          } catch (error) {
            console.log("Unable to deactivate annotation tools:", error);
          }
        }
      }
      // Small delay to avoid racing with EmbedPDF's own state updates
      const timer = setTimeout(() => {
        if (!isSavingRef.current) {
          activateTextSelection();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [
    isRedacting,
    isAnnotationMode,
    disabled,
    isBridgeReady,
    showNavigationWarning,
    setAnnotationMode,
    signatureApiRef,
    activateTextSelection,
  ]);

  // Reset redaction tool when switching between files
  // The new PDF gets a fresh EmbedPDF instance
  useEffect(() => {
    if (prevFileIndexRef.current !== activeFileIndex) {
      prevFileIndexRef.current = activeFileIndex;

      // Reset active type to null when switching files
      if (activeType) {
        setActiveType(null);
      }
    }
  }, [activeFileIndex, activeType, setActiveType]);

  // Handle saving changes - this will apply pending redactions and save to file
  const handleSaveChanges = useCallback(async () => {
    if (applyChanges) {
      isSavingRef.current = true;
      try {
        await applyChanges();
      } finally {
        isSavingRef.current = false;
      }
    }
  }, [applyChanges]);

  // Check if there are unsaved changes to save (pending redactions OR applied redactions)
  const hasUnsavedChanges = pendingCount > 0 || redactionsApplied;

  const isApiReady = isBridgeReady;

  // Which manual-redaction sub-mode is active (drives the tool button highlight).
  const isSelectionActive = activeType === "redactSelection";
  const isMarqueeActive = activeType === "marqueeRedact";

  // Switch to a redaction sub-mode, first stepping out of annotation mode/tools.
  const switchMode = useCallback(
    (activate: () => void) => {
      if (isAnnotationMode) {
        setAnnotationMode(false);
        if (signatureApiRef?.current) {
          try {
            signatureApiRef.current.deactivateTools();
          } catch (error) {
            console.log("Unable to deactivate annotation tools:", error);
          }
        }
      }
      activate();
    },
    [isAnnotationMode, setAnnotationMode, signatureApiRef],
  );

  return (
    <>
      <Divider my="sm" />
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t("redact.manual.title", "Redaction Tools")}
        </Text>

        <Text size="xs" c="dimmed">
          {t(
            "redact.manual.instructions",
            "Select text or draw areas on the PDF to mark content for redaction.",
          )}
        </Text>

        <Group gap="sm" grow wrap="nowrap">
          <Button
            variant={
              isSelectionActive && !isAnnotationMode ? "filled" : "outline"
            }
            color={isSelectionActive && !isAnnotationMode ? "blue" : "gray"}
            leftSection={
              <HighlightAltIcon style={{ fontSize: 18, flexShrink: 0 }} />
            }
            onClick={() => switchMode(activateTextSelection)}
            disabled={disabled || !isApiReady}
            size="sm"
            styles={{
              root: { minWidth: 0 },
              label: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          >
            {t("redact.manual.markText", "Mark Text")}
          </Button>

          <Button
            variant={
              isMarqueeActive && !isAnnotationMode ? "filled" : "outline"
            }
            color={isMarqueeActive && !isAnnotationMode ? "blue" : "gray"}
            leftSection={
              <CropFreeIcon style={{ fontSize: 18, flexShrink: 0 }} />
            }
            onClick={() => switchMode(activateMarquee)}
            disabled={disabled || !isApiReady}
            size="sm"
            styles={{
              root: { minWidth: 0 },
              label: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          >
            {t("redact.manual.markArea", "Mark Area")}
          </Button>
        </Group>

        <ColorInput
          label={t("redact.manual.colorLabel", "Redaction Colour")}
          value={manualRedactColor}
          onChange={setManualRedactColor}
          disabled={disabled || !isApiReady}
          size="sm"
          format="hex"
          popoverProps={{ withinPortal: true }}
        />

        {/* Save Changes Button - applies pending redactions and saves to file */}
        <Button
          fullWidth
          size="md"
          radius="md"
          mt="sm"
          variant="filled"
          color="blue"
          disabled={!hasUnsavedChanges}
          onClick={handleSaveChanges}
        >
          {t("annotation.saveChanges", "Save Changes")}
        </Button>
      </Stack>
    </>
  );
}
