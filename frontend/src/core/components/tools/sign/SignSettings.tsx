import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { Stack, Button, Text, Alert, SegmentedControl, Divider, ActionIcon, Tooltip, Group, Box } from '@mantine/core';
import { SignParameters } from "@app/hooks/tools/sign/useSignParameters";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { useSignature } from "@app/contexts/SignatureContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { PLACEMENT_ACTIVATION_DELAY, FILE_SWITCH_ACTIVATION_DELAY } from '@app/constants/signConstants';

// Import the new reusable components
import { DrawingCanvas } from "@app/components/annotation/shared/DrawingCanvas";
import { DrawingControls } from "@app/components/annotation/shared/DrawingControls";
import { ImageUploader } from "@app/components/annotation/shared/ImageUploader";
import { TextInputWithFont } from "@app/components/annotation/shared/TextInputWithFont";
import { ColorPicker } from "@app/components/annotation/shared/ColorPicker";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { useSavedSignatures, SavedSignature, SavedSignaturePayload, SavedSignatureType, MAX_SAVED_SIGNATURES, AddSignatureResult } from '@app/hooks/tools/sign/useSavedSignatures';
import { SavedSignaturesSection } from '@app/components/tools/sign/SavedSignaturesSection';

type SignatureDrafts = {
  canvas?: string;
  image?: string;
  text?: {
    signerName: string;
    fontSize: number;
    fontFamily: string;
    textColor: string;
  };
};

interface SignSettingsProps {
  parameters: SignParameters;
  onParameterChange: <K extends keyof SignParameters>(key: K, value: SignParameters[K]) => void;
  disabled?: boolean;
  onActivateDrawMode?: () => void;
  onActivateSignaturePlacement?: () => void;
  onDeactivateSignature?: () => void;
  onUpdateDrawSettings?: (color: string, size: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
}

type SignatureSource = 'canvas' | 'image' | 'text' | 'saved';

const SignSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  onActivateSignaturePlacement,
  onDeactivateSignature,
  onUpdateDrawSettings,
  onUndo,
  onRedo,
  onSave
}: SignSettingsProps) => {
  const { t } = useTranslation();
  const { isPlacementMode, signaturesApplied, historyApiRef } = useSignature();
  const { activeFileIndex } = useViewer();
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const historyApiInstance = historyApiRef.current;

  // State for drawing
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [penSizeInput, setPenSizeInput] = useState('2');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isPlacementManuallyPaused, setPlacementManuallyPaused] = useState(false);

  // State for different signature types
  const [canvasSignatureData, setCanvasSignatureData] = useState<string | undefined>();
  const [imageSignatureData, setImageSignatureData] = useState<string | undefined>();
  const [signatureDrafts, setSignatureDrafts] = useState<SignatureDrafts>({});
  const lastSyncedTextDraft = useRef<SignatureDrafts['text'] | null>(null);
  const lastAppliedPlacementKey = useRef<string | null>(null);
  const previousFileIndexRef = useRef(activeFileIndex);
  const {
    savedSignatures,
    isAtCapacity: isSavedSignatureLimitReached,
    addSignature,
    removeSignature,
    updateSignatureLabel,
    byTypeCounts,
  } = useSavedSignatures();
  const [signatureSource, setSignatureSource] = useState<SignatureSource>(parameters.signatureType);
  const [lastSavedSignatureKeys, setLastSavedSignatureKeys] = useState<Record<SavedSignatureType, string | null>>({
    canvas: null,
    image: null,
    text: null,
  });

  const buildTextSignatureKey = useCallback(
    (signerName: string, fontSize: number, fontFamily: string, textColor: string) =>
      JSON.stringify({
        signerName: signerName.trim(),
        fontSize,
        fontFamily,
        textColor,
      }),
    []
  );

  const getDefaultSavedLabel = useCallback(
    (type: SavedSignatureType) => {
      const nextIndex = (byTypeCounts[type] ?? 0) + 1;
      let baseLabel = t('sign.saved.defaultLabel', 'Signature');
      if (type === 'canvas') {
        baseLabel = t('sign.saved.defaultCanvasLabel', 'Drawing signature');
      } else if (type === 'image') {
        baseLabel = t('sign.saved.defaultImageLabel', 'Uploaded signature');
      } else if (type === 'text') {
        baseLabel = t('sign.saved.defaultTextLabel', 'Typed signature');
      }
      return `${baseLabel} ${nextIndex}`;
    },
    [byTypeCounts, t]
  );

  const signatureKeysByType = useMemo(() => {
    const canvasKey = canvasSignatureData ?? null;
    const imageKey = imageSignatureData ?? null;
    const textKey = buildTextSignatureKey(
      parameters.signerName ?? '',
      parameters.fontSize ?? 16,
      parameters.fontFamily ?? 'Helvetica',
      parameters.textColor ?? '#000000'
    );
    return {
      canvas: canvasKey,
      image: imageKey,
      text: textKey,
    };
  }, [canvasSignatureData, imageSignatureData, buildTextSignatureKey, parameters.signerName, parameters.fontSize, parameters.fontFamily, parameters.textColor]);

  const saveSignatureToLibrary = useCallback(
    (payload: SavedSignaturePayload, type: SavedSignatureType): AddSignatureResult => {
      if (isSavedSignatureLimitReached) {
        return { success: false, reason: 'limit' };
      }
      return addSignature(payload, getDefaultSavedLabel(type));
    },
    [addSignature, getDefaultSavedLabel, isSavedSignatureLimitReached]
  );

  const setLastSavedKeyForType = useCallback(
    (type: SavedSignatureType, explicitKey?: string | null) => {
      setLastSavedSignatureKeys(prev => ({
        ...prev,
        [type]: explicitKey !== undefined ? explicitKey : signatureKeysByType[type] ?? null,
      }));
    },
    [signatureKeysByType]
  );

  const handleSaveCanvasSignature = useCallback(() => {
    if (!canvasSignatureData) {
      return;
    }
    const result = saveSignatureToLibrary({ type: 'canvas', dataUrl: canvasSignatureData }, 'canvas');
    if (result.success) {
      setLastSavedKeyForType('canvas');
    }
  }, [canvasSignatureData, saveSignatureToLibrary, setLastSavedKeyForType]);

  const handleSaveImageSignature = useCallback(() => {
    if (!imageSignatureData) {
      return;
    }
    const result = saveSignatureToLibrary({ type: 'image', dataUrl: imageSignatureData }, 'image');
    if (result.success) {
      setLastSavedKeyForType('image');
    }
  }, [imageSignatureData, saveSignatureToLibrary, setLastSavedKeyForType]);

  const handleSaveTextSignature = useCallback(() => {
    const signerName = (parameters.signerName ?? '').trim();
    if (!signerName) {
      return;
    }
    const result = saveSignatureToLibrary(
      {
        type: 'text',
        signerName,
        fontFamily: parameters.fontFamily ?? 'Helvetica',
        fontSize: parameters.fontSize ?? 16,
        textColor: parameters.textColor ?? '#000000',
      },
      'text'
    );
    if (result.success) {
      setLastSavedKeyForType('text');
    }
  }, [
    parameters.fontFamily,
    parameters.fontSize,
    parameters.signerName,
    parameters.textColor,
    saveSignatureToLibrary,
    setLastSavedKeyForType,
  ]);

  const handleUseSavedSignature = useCallback(
    (signature: SavedSignature) => {
      setPlacementManuallyPaused(false);

      if (signature.type === 'canvas') {
        if (parameters.signatureType !== 'canvas') {
          onParameterChange('signatureType', 'canvas');
        }
        setCanvasSignatureData(signature.dataUrl);
      } else if (signature.type === 'image') {
        if (parameters.signatureType !== 'image') {
          onParameterChange('signatureType', 'image');
        }
        setImageSignatureData(signature.dataUrl);
      } else if (signature.type === 'text') {
        if (parameters.signatureType !== 'text') {
          onParameterChange('signatureType', 'text');
        }
        onParameterChange('signerName', signature.signerName);
        onParameterChange('fontFamily', signature.fontFamily);
        onParameterChange('fontSize', signature.fontSize);
        onParameterChange('textColor', signature.textColor);
      }

      const savedKey =
        signature.type === 'text'
          ? buildTextSignatureKey(signature.signerName, signature.fontSize, signature.fontFamily, signature.textColor)
          : signature.dataUrl;
      setLastSavedKeyForType(signature.type, savedKey);

      const activate = () => onActivateSignaturePlacement?.();
      if (typeof window !== 'undefined') {
        window.setTimeout(activate, PLACEMENT_ACTIVATION_DELAY);
      } else {
        activate();
      }
    },
    [
      buildTextSignatureKey,
      onActivateSignaturePlacement,
      onParameterChange,
      parameters.signatureType,
      setCanvasSignatureData,
      setImageSignatureData,
      setPlacementManuallyPaused,
      setLastSavedKeyForType,
    ]
  );

  const handleDeleteSavedSignature = useCallback(
    (signature: SavedSignature) => {
      removeSignature(signature.id);
    },
    [removeSignature]
  );

  const handleRenameSavedSignature = useCallback(
    (id: string, label: string) => {
      updateSignatureLabel(id, label);
    },
    [updateSignatureLabel]
  );

  const renderSaveButton = (type: SavedSignatureType, isReady: boolean, onClick: () => void) => {
    const label = t('sign.saved.saveButton', 'Save signature');
    const currentKey = signatureKeysByType[type];
    const lastSavedKey = lastSavedSignatureKeys[type];
    const hasChanges = Boolean(currentKey && currentKey !== lastSavedKey);
    const isSaved = isReady && !hasChanges;

    let tooltipMessage: string | undefined;
    if (!isReady) {
      tooltipMessage = t('sign.saved.saveUnavailable', 'Create a signature first to save it.');
    } else if (isSaved) {
      tooltipMessage = t('sign.saved.noChanges', 'Current signature is already saved.');
    } else if (isSavedSignatureLimitReached) {
      tooltipMessage = t('sign.saved.limitDescription', 'Remove a saved signature before adding new ones (max {{max}}).', {
        max: MAX_SAVED_SIGNATURES,
      });
    }

    const button = (
      <Button
        size="xs"
        variant="outline"
        color={isSaved ? 'green' : undefined}
        onClick={onClick}
        disabled={!isReady || disabled || isSavedSignatureLimitReached || !hasChanges}
        leftSection={<LocalIcon icon="material-symbols:save-rounded" width={16} height={16} />}
      >
        {isSaved ? t('sign.saved.status.saved', 'Saved') : label}
      </Button>
    );

    if (tooltipMessage) {
      return (
        <Tooltip label={tooltipMessage}>
          <span style={{ display: 'inline-block' }}>{button}</span>
        </Tooltip>
      );
    }

    return button;
  };

  useEffect(() => {
    if (signatureSource === 'saved') {
      return;
    }
    if (signatureSource !== parameters.signatureType) {
      setSignatureSource(parameters.signatureType);
    }
  }, [parameters.signatureType, signatureSource]);

  useEffect(() => {
    if (!disabled) {
      onUpdateDrawSettings?.(selectedColor, penSize);
    }
  }, [selectedColor, penSize, disabled, onUpdateDrawSettings]);

  const handleSignatureSourceChange = useCallback(
    (value: SignatureSource) => {
      setSignatureSource(value);
      if (value === 'saved') {
        return;
      }
      if (parameters.signatureType !== value) {
        onParameterChange('signatureType', value);
      }
    },
    [onParameterChange, parameters.signatureType]
  );

  useEffect(() => {
    if (signaturesApplied) {
      setPlacementManuallyPaused(false);
    }
  }, [signaturesApplied]);

  useEffect(() => {
    if (!historyApiInstance) {
      setHistoryAvailability({ canUndo: false, canRedo: false });
      return;
    }

    const updateAvailability = () => {
      setHistoryAvailability({
        canUndo: historyApiInstance.canUndo?.() ?? false,
        canRedo: historyApiInstance.canRedo?.() ?? false,
      });
    };

    const unsubscribe = historyApiInstance.subscribe?.(updateAvailability);
    updateAvailability();

    return () => {
      unsubscribe?.();
    };
  }, [historyApiInstance]);

  // Handle image upload
  const handleImageChange = async (file: File | null) => {
    if (file && !disabled) {
      try {
        const result = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              resolve(e.target.result as string);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        setImageSignatureData(result);
      } catch (error) {
        console.error('Error reading file:', error);
      }
    } else if (!file) {
      setImageSignatureData(undefined);
      onDeactivateSignature?.();
    }
  };

  // Handle signature data changes
  const handleCanvasSignatureChange = (data: string | null) => {
    const nextValue = data ?? undefined;
    setCanvasSignatureData(prev => {
      if (prev === nextValue) {
        return prev;
      }
      return nextValue;
    });
  };

  const hasCanvasSignature = useMemo(() => Boolean(canvasSignatureData), [canvasSignatureData]);
  const hasImageSignature = useMemo(() => Boolean(imageSignatureData), [imageSignatureData]);
  const hasTextSignature = useMemo(
    () => Boolean(parameters.signerName && parameters.signerName.trim() !== ''),
    [parameters.signerName]
  );

  const hasAnySignature = hasCanvasSignature || hasImageSignature || hasTextSignature;

  const isCurrentTypeReady = useMemo(() => {
    switch (parameters.signatureType) {
      case 'canvas':
        return hasCanvasSignature;
      case 'image':
        return hasImageSignature;
      case 'text':
        return hasTextSignature;
      default:
        return false;
    }
  }, [parameters.signatureType, hasCanvasSignature, hasImageSignature, hasTextSignature]);

  const placementSignatureKey = useMemo(() => {
    if (!isCurrentTypeReady) {
      return null;
    }
    return signatureKeysByType[parameters.signatureType] ?? null;
  }, [isCurrentTypeReady, parameters.signatureType, signatureKeysByType]);

  const shouldEnablePlacement = useMemo(() => {
    if (disabled) return false;
    return isCurrentTypeReady;
  }, [disabled, isCurrentTypeReady]);

  const shouldAutoActivate = shouldEnablePlacement && !isPlacementManuallyPaused && !signaturesApplied;

  useEffect(() => {
    setSignatureDrafts(prev => {
      if (canvasSignatureData) {
        if (prev.canvas === canvasSignatureData) {
          return prev;
        }
        return { ...prev, canvas: canvasSignatureData };
      }

      if (prev.canvas !== undefined) {
        const next = { ...prev };
        delete next.canvas;
        return next;
      }

      return prev;
    });
  }, [canvasSignatureData]);

  useEffect(() => {
    setSignatureDrafts(prev => {
      if (imageSignatureData) {
        if (prev.image === imageSignatureData) {
          return prev;
        }
        return { ...prev, image: imageSignatureData };
      }

      if (prev.image !== undefined) {
        const next = { ...prev };
        delete next.image;
        return next;
      }

      return prev;
    });
  }, [imageSignatureData]);

  useEffect(() => {
    const nextDraft = {
      signerName: parameters.signerName || '',
      fontSize: parameters.fontSize || 16,
      fontFamily: parameters.fontFamily || 'Helvetica',
      textColor: parameters.textColor || '#000000',
    };

    setSignatureDrafts(prev => {
      const prevDraft = prev.text;
      if (
        prevDraft &&
        prevDraft.signerName === nextDraft.signerName &&
        prevDraft.fontSize === nextDraft.fontSize &&
        prevDraft.fontFamily === nextDraft.fontFamily &&
        prevDraft.textColor === nextDraft.textColor
      ) {
        return prev;
      }

      return { ...prev, text: nextDraft };
    });
  }, [parameters.signerName, parameters.fontSize, parameters.fontFamily, parameters.textColor]);

  useEffect(() => {
    if (parameters.signatureType === 'text') {
      const draft = signatureDrafts.text;
      if (!draft) {
        lastSyncedTextDraft.current = null;
        return;
      }

      const currentSignerName = parameters.signerName ?? '';
      const currentFontSize = parameters.fontSize ?? 16;
      const currentFontFamily = parameters.fontFamily ?? 'Helvetica';
      const currentTextColor = parameters.textColor ?? '#000000';

      const isSynced =
        draft.signerName === currentSignerName &&
        draft.fontSize === currentFontSize &&
        draft.fontFamily === currentFontFamily &&
        draft.textColor === currentTextColor;

      if (isSynced) {
        lastSyncedTextDraft.current = draft;
        return;
      }

      const lastSynced = lastSyncedTextDraft.current;
      const alreadyAttempted =
        lastSynced &&
        lastSynced.signerName === draft.signerName &&
        lastSynced.fontSize === draft.fontSize &&
        lastSynced.fontFamily === draft.fontFamily &&
        lastSynced.textColor === draft.textColor;

      if (!alreadyAttempted) {
        lastSyncedTextDraft.current = draft;
        if (draft.signerName !== currentSignerName) {
          onParameterChange('signerName', draft.signerName);
        }
        if (draft.fontSize !== currentFontSize) {
          onParameterChange('fontSize', draft.fontSize);
        }
        if (draft.fontFamily !== currentFontFamily) {
          onParameterChange('fontFamily', draft.fontFamily);
        }
        if (draft.textColor !== currentTextColor) {
          onParameterChange('textColor', draft.textColor);
        }
      }
    } else {
      lastSyncedTextDraft.current = null;
    }
  }, [
    parameters.signatureType,
    parameters.signerName,
    parameters.fontSize,
    parameters.fontFamily,
    parameters.textColor,
    signatureDrafts.text,
    onParameterChange,
  ]);

  useEffect(() => {
    let newSignatureData: string | undefined = undefined;

    if (parameters.signatureType === 'image' && imageSignatureData) {
      newSignatureData = imageSignatureData;
    } else if (parameters.signatureType === 'canvas' && canvasSignatureData) {
      newSignatureData = canvasSignatureData;
    }

    if (parameters.signatureData !== newSignatureData) {
      onParameterChange('signatureData', newSignatureData);
    }
  }, [parameters.signatureType, parameters.signatureData, canvasSignatureData, imageSignatureData, onParameterChange]);

  useEffect(() => {
    if (!shouldEnablePlacement) {
      if (isPlacementMode) {
        onDeactivateSignature?.();
      }
      if (isPlacementManuallyPaused) {
        setPlacementManuallyPaused(false);
      }
      return;
    }

    if (!shouldAutoActivate || isPlacementMode) {
      return;
    }

    if (typeof window !== 'undefined') {
      const timer = window.setTimeout(() => {
        onActivateSignaturePlacement?.();
      }, PLACEMENT_ACTIVATION_DELAY);
      return () => {
        window.clearTimeout(timer);
      };
    }

    onActivateSignaturePlacement?.();
  }, [
    shouldEnablePlacement,
    shouldAutoActivate,
    isPlacementMode,
    isPlacementManuallyPaused,
    onActivateSignaturePlacement,
    onDeactivateSignature,
  ]);

  useEffect(() => {
    if (!shouldAutoActivate || !placementSignatureKey) {
      if (!shouldEnablePlacement || !shouldAutoActivate) {
        lastAppliedPlacementKey.current = null;
      }
      return;
    }

    if (!isPlacementMode) {
      lastAppliedPlacementKey.current = null;
      return;
    }

    if (lastAppliedPlacementKey.current === placementSignatureKey) {
      return;
    }

    const trigger = () => {
      onActivateSignaturePlacement?.();
      lastAppliedPlacementKey.current = placementSignatureKey;
    };

    if (typeof window !== 'undefined') {
      const timer = window.setTimeout(trigger, PLACEMENT_ACTIVATION_DELAY);
      return () => {
        window.clearTimeout(timer);
      };
    }

    trigger();
  }, [placementSignatureKey, shouldAutoActivate, shouldEnablePlacement, isPlacementMode, onActivateSignaturePlacement]);
  useEffect(() => {
    if (activeFileIndex === previousFileIndexRef.current) {
      return;
    }

    previousFileIndexRef.current = activeFileIndex;

    if (!shouldEnablePlacement || signaturesApplied) {
      return;
    }

    setPlacementManuallyPaused(false);
    lastAppliedPlacementKey.current = null;

    if (typeof window !== 'undefined') {
      const timer = window.setTimeout(() => {
        onActivateSignaturePlacement?.();
      }, FILE_SWITCH_ACTIVATION_DELAY);
      return () => {
        window.clearTimeout(timer);
      };
    }

    onActivateSignaturePlacement?.();
  }, [activeFileIndex, shouldEnablePlacement, signaturesApplied, onActivateSignaturePlacement]);

  const renderSignatureBuilder = () => {
    if (signatureSource === 'saved') {
      return (
        <SavedSignaturesSection
          signatures={savedSignatures}
          disabled={disabled}
          isAtCapacity={isSavedSignatureLimitReached}
          onUseSignature={handleUseSavedSignature}
          onDeleteSignature={handleDeleteSavedSignature}
          onRenameSignature={handleRenameSavedSignature}
        />
      );
    }

    if (signatureSource === 'canvas') {
      return (
        <Stack gap="xs">
          <DrawingCanvas
            selectedColor={selectedColor}
            penSize={penSize}
            penSizeInput={penSizeInput}
            onColorSwatchClick={() => setIsColorPickerOpen(true)}
            onPenSizeChange={setPenSize}
            onPenSizeInputChange={setPenSizeInput}
            onSignatureDataChange={handleCanvasSignatureChange}
            onDrawingComplete={() => {
              onActivateSignaturePlacement?.();
            }}
            disabled={disabled}
            initialSignatureData={canvasSignatureData}
          />
          <Box style={{ alignSelf: 'flex-start', marginTop: '0.4rem' }}>
            {renderSaveButton('canvas', hasCanvasSignature, handleSaveCanvasSignature)}
          </Box>
        </Stack>
      );
    }

    if (signatureSource === 'image') {
      return (
        <Stack gap="xs">
          <ImageUploader
            onImageChange={handleImageChange}
            disabled={disabled}
          />
          <Box style={{ alignSelf: 'flex-start', marginTop: '0.4rem' }}>
            {renderSaveButton('image', hasImageSignature, handleSaveImageSignature)}
          </Box>
        </Stack>
      );
    }

    return (
      <Stack gap="xs">
        <TextInputWithFont
          text={parameters.signerName || ''}
          onTextChange={(text) => onParameterChange('signerName', text)}
          fontSize={parameters.fontSize || 16}
          onFontSizeChange={(size) => onParameterChange('fontSize', size)}
          fontFamily={parameters.fontFamily || 'Helvetica'}
          onFontFamilyChange={(family) => onParameterChange('fontFamily', family)}
          textColor={parameters.textColor || '#000000'}
          onTextColorChange={(color) => onParameterChange('textColor', color)}
          disabled={disabled}
        />
        <Box style={{ alignSelf: 'flex-start', marginTop: '0.4rem' }}>
          {renderSaveButton('text', hasTextSignature, handleSaveTextSignature)}
        </Box>
      </Stack>
    );
  };

  const placementInstructions = () => {
    if (signatureSource === 'saved') {
      return t(
        'sign.instructions.saved',
        'Select a saved signature above, then click anywhere on the PDF to place it.'
      );
    }
    if (parameters.signatureType === 'canvas') {
      return t(
        'sign.instructions.canvas',
        'After drawing your signature and closing the canvas, click anywhere on the PDF to place it.'
      );
    }
    if (parameters.signatureType === 'image') {
      return t(
        'sign.instructions.image',
        'After uploading your signature image, click anywhere on the PDF to place it.'
      );
    }
    return t(
      'sign.instructions.text',
      'After entering your name above, click anywhere on the PDF to place your signature.'
    );
  };

  const placementAlert = isCurrentTypeReady
    ? {
        color: isPlacementMode ? 'blue' : 'teal',
        title: isPlacementMode
          ? t('sign.instructions.title', 'How to add your signature')
          : t('sign.instructions.paused', 'Placement paused'),
        message: isPlacementMode
          ? placementInstructions()
          : t('sign.instructions.resumeHint', 'Resume placement to click and add your signature.'),
      }
    : {
        color: 'yellow',
        title: t('sign.instructions.title', 'How to add your signature'),
        message: t('sign.instructions.noSignature', 'Create a signature above to enable placement tools.'),
      };

  const handlePausePlacement = () => {
    setPlacementManuallyPaused(true);
    onDeactivateSignature?.();
  };

  const handleResumePlacement = () => {
    setPlacementManuallyPaused(false);
    onActivateSignaturePlacement?.();
  };

  // Handle Escape key to toggle pause/resume
  useEffect(() => {
    if (!isCurrentTypeReady) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isPlacementMode) {
          handlePausePlacement();
        } else if (isPlacementManuallyPaused) {
          handleResumePlacement();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCurrentTypeReady, isPlacementMode, isPlacementManuallyPaused]);

  const placementToggleControl =
    onActivateSignaturePlacement || onDeactivateSignature
      ? isPlacementMode
        ? (
            <Tooltip label={t('sign.mode.pause', 'Pause placement')}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t('sign.mode.pause', 'Pause placement')}
                onClick={handlePausePlacement}
                disabled={disabled || !onDeactivateSignature}
                style={{
                  width: 'auto',
                  paddingInline: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <LocalIcon icon="material-symbols:pause-rounded" width={20} height={20} />
                <Text component="span" size="sm" fw={500}>
                  {t('sign.mode.pause', 'Pause placement')}
                </Text>
              </ActionIcon>
            </Tooltip>
          )
        : (
            <Tooltip label={t('sign.mode.resume', 'Resume placement')}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t('sign.mode.resume', 'Resume placement')}
                onClick={handleResumePlacement}
                disabled={disabled || !isCurrentTypeReady || !onActivateSignaturePlacement}
                style={{
                  width: 'auto',
                  paddingInline: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <LocalIcon icon="material-symbols:play-arrow-rounded" width={20} height={20} />
                <Text component="span" size="sm" fw={500}>
                  {t('sign.mode.resume', 'Resume placement')}
                </Text>
              </ActionIcon>
            </Tooltip>
          )
      : null;

  return (
    <Stack>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t('sign.step.createDesc', 'Choose how you want to create the signature')}
        </Text>
        <SegmentedControl
          value={signatureSource}
          fullWidth
          onChange={(value) => handleSignatureSourceChange(value as SignatureSource)}
          data={[
            { label: t('sign.type.canvas', 'Draw'), value: 'canvas' },
            { label: t('sign.type.image', 'Upload'), value: 'image' },
            { label: t('sign.type.text', 'Type'), value: 'text' },
            { label: t('sign.type.saved', 'Saved'), value: 'saved' },
          ]}
        />
        {renderSignatureBuilder()}
      </Stack>

      <Divider />

      <Stack gap="sm">
        <Text fw={600} size="md">
          {t('sign.step.place', 'Place & save')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('sign.step.placeDesc', 'Position the signature on your PDF')}
        </Text>

        <Group gap="xs" wrap="nowrap" align="center">
          <DrawingControls
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={historyAvailability.canUndo}
            canRedo={historyAvailability.canRedo}
            hasSignatureData={hasAnySignature}
            disabled={disabled}
            showPlaceButton={false}
          />
          <Box style={{ marginLeft: 'auto' }}>
            {placementToggleControl}
          </Box>
        </Group>

        <Alert color={placementAlert.color} title={placementAlert.title}>
          <Text size="sm">
            {placementAlert.message}
          </Text>
        </Alert>

      </Stack>

      <ColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
        title={t('sign.canvas.colorPickerTitle', 'Choose stroke colour')}
      />

      {onSave && (
        <Button
          onClick={onSave}
          color="blue"
          variant="filled"
          fullWidth
        >
          {t('sign.applySignatures', 'Apply Signatures')}
        </Button>
      )}

      <SuggestedToolsSection />
    </Stack>
  );
};

export default SignSettings;
