import { useTranslation } from "react-i18next";
import { useEffect, useRef, useCallback } from "react";
import { Button, Stack, Text, Divider, ColorInput } from "@mantine/core";
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
    activateManualRedact,
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

  // Keep redaction tool active at all times while this component is mounted.
  // If anything deactivates it (annotation tools, text selection, file switch, etc.)
  // this re-enables it automatically — no manual "Activate" button needed.
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
          activateManualRedact();
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
    activateManualRedact,
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
