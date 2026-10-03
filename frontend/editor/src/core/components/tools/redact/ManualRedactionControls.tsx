import { useTranslation } from "react-i18next";
import { useEffect, useRef, useCallback, useState } from "react";
import { Stack, Text, Divider, ColorInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useRedaction, useRedactionMode } from "@app/contexts/RedactionContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useSignature } from "@app/contexts/SignatureContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";

interface ManualRedactionControlsProps {
  disabled?: boolean;
}

/**
 * ManualRedactionControls provides UI for manual PDF redaction in the tool panel.
 * Marking queues redactions; the single action commits them and saves the
 * document, so an applied redaction is never left dirty in memory.
 */
export default function ManualRedactionControls({
  disabled = false,
}: ManualRedactionControlsProps) {
  const { t } = useTranslation();

  // Use our RedactionContext which bridges to EmbedPDF
  const {
    activateManualRedact,
    commitAllPending,
    setActiveType,
    setManualRedactColor,
    redactionsApplied,
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

  const isLeavingRef = useRef(false);
  const prevFileIndexRef = useRef(activeFileIndex);
  const [isApplying, setIsApplying] = useState(false);

  // Keep redaction tool active at all times while this component is mounted.
  // If anything deactivates it (annotation tools, text selection, file switch, etc.)
  // this re-enables it automatically — no manual "Activate" button needed.
  // Activation is deferred so we never synchronously re-enter the effect in the
  // same commit (which previously triggered React's "too many re-renders" error #185).
  useEffect(() => {
    if (
      disabled ||
      !isBridgeReady ||
      isLeavingRef.current ||
      isApplying ||
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
        if (!isLeavingRef.current && !isApplying && !showNavigationWarning) {
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
    isApplying,
    showNavigationWarning,
    activateManualRedact,
    setAnnotationMode,
    signatureApiRef,
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

  // Applying marks is permanent, so it also saves: an applied mark kept only in
  // memory would leave the document dirty and a second save button to find.
  // The commit goes through the bridge directly so the save cannot race an
  // uncommitted mark into the exported file as a stale annotation.
  const handleApplyRedactions = useCallback(async () => {
    if (!applyChanges) return;
    setIsApplying(true);
    try {
      await commitAllPending();
      await applyChanges();
    } catch {
      // Viewer reports save failure to user.
    } finally {
      setIsApplying(false);
    }
  }, [applyChanges, commitAllPending]);

  // pendingCount drops to zero the moment the commit lands, so gating on it
  // alone would unmount this button before a failed export could be retried.
  // redactionsApplied stays set until a save succeeds. Annotation dirty state is
  // deliberately not included: that is saved from the Annotate panel, not here.
  const hasUnsavedChanges = pendingCount > 0 || redactionsApplied;
  const applyLabel =
    pendingCount > 0
      ? `${t("viewer.redaction.applyAll", "Apply Redactions")} (${pendingCount})`
      : t("annotation.saveChanges", "Save Changes");

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

        {hasUnsavedChanges && (
          <Button
            fullWidth
            size="md"
            accent="danger"
            loading={isApplying}
            onClick={handleApplyRedactions}
          >
            {applyLabel}
          </Button>
        )}
      </Stack>
    </>
  );
}
