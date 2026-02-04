import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useCallback } from 'react';
import { Button, Stack, Text, Divider } from '@mantine/core';
import { useRedaction, useRedactionMode } from '@app/contexts/RedactionContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { RedactionMode } from '@embedpdf/plugin-redaction';

interface ManualRedactionControlsProps {
  disabled?: boolean;
}

/**
 * ManualRedactionControls provides UI for manual PDF redaction in the tool panel.
 * Displays controls for marking text/areas for redaction and applying them.
 * Uses the unified redaction mode from embedPDF v2.4.1 (combines text selection and area marquee).
 */
export default function ManualRedactionControls({ disabled = false }: ManualRedactionControlsProps) {
  const { t } = useTranslation();

  // Use our RedactionContext which bridges to EmbedPDF
  const { activateRedact, redactionsApplied, setActiveType } = useRedaction();
  const { pendingCount, activeType, isRedacting, isBridgeReady } = useRedactionMode();
  
  // Get viewer context to manage annotation mode and save changes
  const { isAnnotationMode, setAnnotationMode, applyChanges, activeFileIndex } = useViewer();
  
  // Get signature context to deactivate annotation tools when switching to redaction
  const { signatureApiRef } = useSignature();
  
  // Check if unified redact mode is active (combines text selection and area marquee)
  const isRedactActive = activeType === RedactionMode.Redact;
  
  // Track if we've auto-activated
  const hasAutoActivated = useRef(false);
  
  // Track the previous file index to detect file switches
  const prevFileIndexRef = useRef<number>(activeFileIndex);
  
  // Track previous pending count to detect when all redactions are applied
  const prevPendingCountRef = useRef<number>(pendingCount);
  
  // Track if we're currently auto-saving to prevent re-entry
  const isAutoSavingRef = useRef(false);

  // Auto-activate unified redact mode when the API bridge becomes ready
  // This ensures redaction mode is active when entering manual redaction mode
  useEffect(() => {
    if (isBridgeReady && !disabled && !isRedacting && !hasAutoActivated.current) {
      hasAutoActivated.current = true;
      // Small delay to ensure EmbedPDF is fully ready
      const timer = setTimeout(() => {
        // Deactivate annotation mode to show redaction layer
        setAnnotationMode(false);
        activateRedact();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isBridgeReady, disabled, isRedacting, activateRedact, setAnnotationMode]);

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
      // This requires the user to re-click which ensures proper activation on the new PDF
      if (isRedactActive) {
        setActiveType(null);
      }
    }
  }, [activeFileIndex, isRedactActive, setActiveType]);

  // Auto-save when all pending redactions have been applied
  // This triggers when the user clicks "Apply (permanent)" on the last pending redaction
  useEffect(() => {
    const hadPendingBefore = prevPendingCountRef.current > 0;
    const hasNoPendingNow = pendingCount === 0;
    const wasJustCleared = hadPendingBefore && hasNoPendingNow;
    
    // Update the ref for next comparison
    prevPendingCountRef.current = pendingCount;
    
    // Auto-save when:
    // - pendingCount just went from > 0 to 0 (user applied the last pending redaction)
    // - redactionsApplied is true (at least one redaction was committed)
    // - not already auto-saving
    // - applyChanges is available
    if (wasJustCleared && redactionsApplied && !isAutoSavingRef.current && applyChanges) {
      isAutoSavingRef.current = true;
      
      // Small delay to ensure UI updates before save
      const timer = setTimeout(async () => {
        try {
          await applyChanges();
        } finally {
          isAutoSavingRef.current = false;
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
        isAutoSavingRef.current = false;
      };
    }
  }, [pendingCount, redactionsApplied, applyChanges]);

  // Handle activating unified redact mode (combines text selection and area marquee)
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
    
    // Activate unified redact mode
    activateRedact();
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

        {/* Unified Redact Tool - combines text selection and area marquee */}
        <Button
          fullWidth
          variant={isRedactActive && !isAnnotationMode ? 'filled' : 'outline'}
          color={isRedactActive && !isAnnotationMode ? 'blue' : 'gray'}
          onClick={handleRedactClick}
          disabled={disabled || !isApiReady}
          size="sm"
        >
          {t('redact.manual.startRedacting', 'Start Redacting')}
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

