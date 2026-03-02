import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useCallback } from 'react';
import { Button, Stack, Text, Divider, ColorInput } from '@mantine/core';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useRedaction, useRedactionMode } from '@app/contexts/RedactionContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';

interface ManualRedactionControlsProps {
  disabled?: boolean;
}

/**
 * ManualRedactionControls provides UI for manual PDF redaction in the tool panel.
 * Displays controls for marking text/areas for redaction and applying them.
 */
export default function ManualRedactionControls({ disabled = false }: ManualRedactionControlsProps) {
  const { t } = useTranslation();

  // Use our RedactionContext which bridges to EmbedPDF
  const { activateManualRedact, redactionsApplied, setActiveType, setManualRedactColor } = useRedaction();
  const { pendingCount, activeType, isBridgeReady, isRedacting, manualRedactColor } = useRedactionMode();

  // Get viewer context to manage annotation mode and save changes
  const { isAnnotationMode, setAnnotationMode, applyChanges, activeFileIndex } = useViewer();

  // Get signature context to deactivate annotation tools when switching to redaction
  const { signatureApiRef } = useSignature();

  // Check if redaction mode is active
  const isRedactActive = isRedacting;

  // Track if we've auto-activated for the current bridge session
  const hasAutoActivated = useRef(false);

  // Track the previous file index to detect file switches
  const prevFileIndexRef = useRef<number>(activeFileIndex);

  // Auto-activate selection mode when the API bridge becomes ready
  // This ensures Mark Text is pre-selected when entering manual redaction mode
  useEffect(() => {
    if (isBridgeReady && !disabled && !hasAutoActivated.current) {
      hasAutoActivated.current = true;
      // Small delay to ensure EmbedPDF is fully ready
      const timer = setTimeout(() => {
        // Deactivate annotation mode to show redaction layer
        setAnnotationMode(false);
        // Pre-select the Redaction tool
        activateManualRedact();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isBridgeReady, disabled, activateManualRedact, setAnnotationMode]);

  // Reset auto-activation flag when disabled changes or bridge becomes not ready
  useEffect(() => {
    if (disabled || !isBridgeReady) {
      hasAutoActivated.current = false;
    }
  }, [disabled, isBridgeReady]);

  // Reset redaction tool when switching between files
  // The new PDF gets a fresh EmbedPDF instance - forcing user to re-select tool ensures it works properly
  useEffect(() => {
    if (prevFileIndexRef.current !== activeFileIndex) {
      prevFileIndexRef.current = activeFileIndex;

      // Reset active type to null when switching files
      if (activeType) {
        setActiveType(null);
      }

      // Reset auto-activation flag so new file can auto-activate
      hasAutoActivated.current = false;
    }
  }, [activeFileIndex, activeType, setActiveType]);

  const handleRedactClick = () => {
    // Deactivate annotation mode and tools to switch to redaction layer
    if (isAnnotationMode) {
      setAnnotationMode(false);
      // Deactivate any active annotation tools (like draw)
      if (signatureApiRef?.current) {
        try {
          signatureApiRef.current.deactivateTools();
        } catch (error) {
          console.log('Unable to deactivate annotation tools:', error);
        }
      }
    }

    activateManualRedact();
  };

  // Handle saving changes - this will apply pending redactions and save to file
  const handleSaveChanges = useCallback(async () => {
    if (applyChanges) {
      await applyChanges();
    }
  }, [applyChanges]);

  // Check if there are unsaved changes to save (pending redactions OR applied redactions)
  // Save Changes button will apply pending redactions and then save everything
  const hasUnsavedChanges = pendingCount > 0 || redactionsApplied;

  // Check if API is available - use isBridgeReady state instead of ref (refs don't trigger re-renders)
  const isApiReady = isBridgeReady;

  return (
    <>
      <Divider my="sm" />
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('redact.manual.title', 'Redaction Tools')}
        </Text>

        <Text size="xs" c="dimmed">
          {t('redact.manual.instructions', 'Select text or draw areas on the PDF to mark content for redaction.')}
        </Text>

        <ColorInput
          label={t('redact.manual.colorLabel', 'Redaction Colour')}
          value={manualRedactColor}
          onChange={setManualRedactColor}
          disabled={disabled || !isApiReady}
          size="sm"
          format="hex"
          popoverProps={{ withinPortal: true }}
        />

        <Button
          variant={isRedactActive && !isAnnotationMode ? 'filled' : 'outline'}
          color={isRedactActive && !isAnnotationMode ? 'blue' : 'gray'}
          leftSection={<AutoFixHighIcon style={{ fontSize: 18, flexShrink: 0 }} />}
          onClick={handleRedactClick}
          disabled={disabled || !isApiReady}
          fullWidth
          size="sm"
        >
          {isRedactActive && !isAnnotationMode ? t('redact.manual.active', 'Redaction Mode Active') : t('redact.manual.activate', 'Activate Redaction Tool')}
        </Button>

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
          {t('annotation.saveChanges', 'Save Changes')}
        </Button>
      </Stack>
    </>
  );
}

