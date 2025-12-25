import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useCallback } from 'react';
import { Button, Stack, Text, Group, Divider } from '@mantine/core';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import CropFreeIcon from '@mui/icons-material/CropFree';
import { useRedaction, useRedactionMode } from '@app/contexts/RedactionContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';

interface ManualRedactionControlsProps {
  disabled?: boolean;
}

/**
 * ManualRedactionControls provides UI for manual PDF redaction in the tool panel.
 * Displays controls for marking text/areas for redaction and applying them.
 * Uses our RedactionContext which bridges to the EmbedPDF API.
 */
export default function ManualRedactionControls({ disabled = false }: ManualRedactionControlsProps) {
  const { t } = useTranslation();

  // Use our RedactionContext which bridges to EmbedPDF
  const { activateTextSelection, activateMarquee, redactionApiRef, redactionsApplied } = useRedaction();
  const { pendingCount, activeType, isRedacting } = useRedactionMode();
  
  // Get viewer context to manage annotation mode and save changes
  const { isAnnotationMode, setAnnotationMode, applyChanges } = useViewer();
  
  // Get signature context to deactivate annotation tools when switching to redaction
  const { signatureApiRef } = useSignature();
  
  // Check which tool is active based on activeType
  const isSelectionActive = activeType === 'redactSelection';
  const isMarqueeActive = activeType === 'marqueeRedact';
  
  // Track if we've auto-activated
  const hasAutoActivated = useRef(false);

  // Auto-activate selection mode when the API becomes available
  // This ensures at least one tool is selected when entering manual redaction mode
  useEffect(() => {
    if (redactionApiRef.current && !disabled && !isRedacting && !hasAutoActivated.current) {
      hasAutoActivated.current = true;
      // Small delay to ensure EmbedPDF is fully ready
      const timer = setTimeout(() => {
        // Deactivate annotation mode to show redaction layer
        setAnnotationMode(false);
        activateTextSelection();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [redactionApiRef.current, disabled, isRedacting, activateTextSelection, setAnnotationMode]);

  // Reset auto-activation flag when disabled changes
  useEffect(() => {
    if (disabled) {
      hasAutoActivated.current = false;
    }
  }, [disabled]);

  const handleSelectionClick = () => {
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
    
    if (isSelectionActive && !isAnnotationMode) {
      // If already active and not coming from annotation mode, switch to marquee
      activateMarquee();
    } else {
      activateTextSelection();
    }
  };

  const handleMarqueeClick = () => {
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
    
    if (isMarqueeActive && !isAnnotationMode) {
      // If already active and not coming from annotation mode, switch to selection
      activateTextSelection();
    } else {
      activateMarquee();
    }
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
  
  // Check if API is available
  const isApiReady = redactionApiRef.current !== null;

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

        <Group gap="sm" grow wrap="nowrap">
          {/* Mark Text Selection Tool */}
          <Button
            variant={isSelectionActive && !isAnnotationMode ? 'filled' : 'outline'}
            color={isSelectionActive && !isAnnotationMode ? 'blue' : 'gray'}
            leftSection={<HighlightAltIcon style={{ fontSize: 18, flexShrink: 0 }} />}
            onClick={handleSelectionClick}
            disabled={disabled || !isApiReady}
            size="sm"
            styles={{
              root: { 
                minWidth: 0,
              },
              label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }}
          >
            {t('redact.manual.markText', 'Mark Text')}
          </Button>

          {/* Mark Area (Marquee) Tool */}
          <Button
            variant={isMarqueeActive && !isAnnotationMode ? 'filled' : 'outline'}
            color={isMarqueeActive && !isAnnotationMode ? 'blue' : 'gray'}
            leftSection={<CropFreeIcon style={{ fontSize: 18, flexShrink: 0 }} />}
            onClick={handleMarqueeClick}
            disabled={disabled || !isApiReady}
            size="sm"
            styles={{
              root: { 
                minWidth: 0,
              },
              label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }}
          >
            {t('redact.manual.markArea', 'Mark Area')}
          </Button>
        </Group>

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

