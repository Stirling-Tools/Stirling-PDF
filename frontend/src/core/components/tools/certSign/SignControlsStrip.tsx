import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Group, Menu, SegmentedControl, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DrawIcon from '@mui/icons-material/Draw';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';

import { DEFAULT_PARAMETERS, type SignParameters } from '@app/hooks/tools/sign/useSignParameters';
import { useSavedSignatures, type SavedSignature } from '@app/hooks/tools/sign/useSavedSignatures';
import { DrawingCanvas } from '@app/components/annotation/shared/DrawingCanvas';
import { ColorPicker } from '@app/components/annotation/shared/ColorPicker';
import { TextInputWithFont } from '@app/components/annotation/shared/TextInputWithFont';
import { buildSignaturePreview } from '@app/utils/signaturePreview';

import styles from './SignControlsStrip.module.css';

interface SignControlsStripProps {
  visible: boolean;
  placementMode: boolean;
  onPlacementModeChange: (active: boolean) => void;
  onSignatureSelected: (config: SignParameters) => void;
  onComplete: () => void;
  canComplete: boolean;
  signatureConfig: SignParameters | null;
  hasSelectedAnnotation?: boolean;
  onDeleteSelected?: () => void;
}

export default function SignControlsStrip({
  visible,
  placementMode,
  onPlacementModeChange,
  onSignatureSelected,
  onComplete,
  canComplete,
  signatureConfig,
  hasSelectedAnnotation = false,
  onDeleteSelected,
}: SignControlsStripProps) {
  const { t } = useTranslation();
  const {
    savedSignatures,
    addSignature,
    isAtCapacity,
    byTypeCounts,
    markSignatureUsed,
    refreshSignatures,
  } = useSavedSignatures();

  const [createSignatureType, setCreateSignatureType] = useState<'canvas' | 'text' | 'image' | null>(null);
  const [canvasColorPickerOpen, setCanvasColorPickerOpen] = useState(false);
  const [canvasColor, setCanvasColor] = useState('#000000');
  const [canvasPenSize, setCanvasPenSize] = useState(2);
  const [canvasPenSizeInput, setCanvasPenSizeInput] = useState('2');
  const [canvasSignatureData, setCanvasSignatureData] = useState<string | undefined>();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [textSignerName, setTextSignerName] = useState(DEFAULT_PARAMETERS.signerName ?? '');
  const [textFontFamily, setTextFontFamily] = useState(DEFAULT_PARAMETERS.fontFamily ?? 'Helvetica');
  const [textFontSize, setTextFontSize] = useState(DEFAULT_PARAMETERS.fontSize ?? 16);
  const [textColor, setTextColor] = useState(DEFAULT_PARAMETERS.textColor ?? '#000000');

  const renderSavedSignaturePreview = useCallback(
    (sig: SavedSignature) => {
      if (sig.type === 'text') {
        return (
          <Box
            component="div"
            style={{
              width: 72,
              height: 28,
              backgroundColor: '#ffffff',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 8px',
              overflow: 'hidden',
            }}
          >
            <Text
              size="sm"
              style={{
                fontFamily: sig.fontFamily,
                color: sig.textColor,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {sig.signerName}
            </Text>
          </Box>
        );
      }

      return (
        <Box
          component="div"
          style={{
            width: 72,
            height: 28,
            backgroundColor: '#ffffff',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 6px',
          }}
        >
          <Box
            component="img"
            src={sig.dataUrl}
            alt={sig.label || t('certSign.collab.signRequest.saved.defaultLabel', 'Signature')}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </Box>
      );
    },
    [t]
  );

  const sortedSavedSignatures = useMemo(() => {
    if (!savedSignatures.length) return [];
    return [...savedSignatures].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  }, [savedSignatures]);

  const beginPlacement = useCallback(
    (config: SignParameters) => {
      const nextConfig: SignParameters = {
        ...DEFAULT_PARAMETERS,
        ...config,
      };

      onSignatureSelected(nextConfig);
      onPlacementModeChange(true);
    },
    [onSignatureSelected, onPlacementModeChange]
  );

  const applySavedSignature = useCallback(
    (sig: SavedSignature) => {
      void markSignatureUsed?.(sig.id);

      if (sig.type === 'text') {
        beginPlacement({
          signatureType: 'text',
          signerName: sig.signerName,
          fontFamily: sig.fontFamily,
          fontSize: sig.fontSize,
          textColor: sig.textColor,
          signatureData: sig.dataUrl,
        });
        return;
      }
      beginPlacement({ signatureType: sig.type, signatureData: sig.dataUrl });
    },
    [beginPlacement, markSignatureUsed]
  );

  const pausePlacement = useCallback(() => {
    onPlacementModeChange(false);
  }, [onPlacementModeChange]);

  const resumePlacement = useCallback(() => {
    onPlacementModeChange(true);
  }, [onPlacementModeChange]);

  const handleCreateSignature = useCallback((type: 'canvas' | 'text' | 'image') => {
    setCreateSignatureType(type);
    if (type === 'canvas') {
      setCanvasColor('#000000');
      setCanvasPenSize(2);
      setCanvasPenSizeInput('2');
      setCanvasSignatureData(undefined);
    } else if (type === 'text') {
      setTextSignerName('');
    }
  }, []);

  const handleCancelCreate = useCallback(() => {
    setCreateSignatureType(null);
  }, []);

  const saveTextToLibrary = useCallback(async () => {
    const signerName = textSignerName.trim();
    if (!signerName || isAtCapacity) return null;

    const preview = await buildSignaturePreview({
      signatureType: 'text',
      signerName,
      fontFamily: textFontFamily,
      fontSize: textFontSize,
      textColor,
    });
    if (!preview?.dataUrl) return null;

    const nextIndex = (byTypeCounts?.text ?? 0) + 1;
    const baseLabel = t('certSign.collab.signRequest.saved.defaultTextLabel', 'Typed signature');
    await addSignature(
      {
        type: 'text',
        dataUrl: preview.dataUrl,
        signerName,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        textColor,
      },
      `${baseLabel} ${nextIndex}`,
      'localStorage'
    );
    await refreshSignatures?.();
    return {
      signerName,
      fontFamily: textFontFamily,
      fontSize: textFontSize,
      textColor,
      dataUrl: preview.dataUrl,
    };
  }, [
    addSignature,
    byTypeCounts?.text,
    isAtCapacity,
    refreshSignatures,
    t,
    textColor,
    textFontFamily,
    textFontSize,
    textSignerName,
  ]);

  const saveImageToLibrary = useCallback(
    async (dataUrl: string) => {
      if (!dataUrl || isAtCapacity) return;
      const nextIndex = (byTypeCounts?.image ?? 0) + 1;
      const baseLabel = t('certSign.collab.signRequest.saved.defaultImageLabel', 'Uploaded signature');
      await addSignature({ type: 'image', dataUrl }, `${baseLabel} ${nextIndex}`, 'localStorage');
      await refreshSignatures?.();
    },
    [addSignature, byTypeCounts?.image, isAtCapacity, refreshSignatures, t]
  );

  const readFileAsDataUrl = useCallback(async (file: File): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = reader.result;
        if (typeof value === 'string') resolve(value);
        else reject(new Error('Failed to read image as data URL'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  const saveCanvasToLibrary = useCallback(
    async (dataUrl: string) => {
      if (!dataUrl || isAtCapacity) return;
      const nextIndex = (byTypeCounts?.canvas ?? 0) + 1;
      const baseLabel = t('certSign.collab.signRequest.saved.defaultCanvasLabel', 'Drawing signature');
      await addSignature({ type: 'canvas', dataUrl }, `${baseLabel} ${nextIndex}`, 'localStorage');
      await refreshSignatures?.();
    },
    [addSignature, byTypeCounts?.canvas, isAtCapacity, refreshSignatures, t]
  );

  useEffect(() => {
    if (!visible || !signatureConfig) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || (target as any)?.isContentEditable;
      if (isTypingTarget) return;

      if (event.key === 'Escape') {
        pausePlacement();
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        onDeleteSelected?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pausePlacement, onDeleteSelected, signatureConfig, visible]);

  const handleCanvasSignatureChange = useCallback(
    async (dataUrl: string | null) => {
      if (!dataUrl) return;
      setCanvasSignatureData(dataUrl);
    },
    []
  );

  const handleSaveCanvas = useCallback(async () => {
    if (!canvasSignatureData) return;
    await saveCanvasToLibrary(canvasSignatureData);
    beginPlacement({ signatureType: 'canvas', signatureData: canvasSignatureData });
    setCreateSignatureType(null);
    setCanvasSignatureData(undefined);
  }, [canvasSignatureData, saveCanvasToLibrary, beginPlacement]);

  const handleSaveText = useCallback(async () => {
    const saved = await saveTextToLibrary();
    if (!saved) return;
    beginPlacement({
      signatureType: 'text',
      signerName: saved.signerName,
      fontFamily: saved.fontFamily,
      fontSize: saved.fontSize,
      textColor: saved.textColor,
      signatureData: saved.dataUrl,
    });
    setCreateSignatureType(null);
    setTextSignerName('');
  }, [saveTextToLibrary, beginPlacement]);

  const handleImageSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      e.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        await saveImageToLibrary(dataUrl);
        beginPlacement({ signatureType: 'image', signatureData: dataUrl });
        setCreateSignatureType(null);
      } catch (err) {
        console.error('Failed to read signature image:', err);
      }
    },
    [readFileAsDataUrl, saveImageToLibrary, beginPlacement]
  );

  if (!visible || !signatureConfig) return null;

  const previewNode =
    signatureConfig.signatureType === 'text' ? (
      <div
        className={styles.signingPreviewFrame}
        style={{
          fontFamily: signatureConfig.fontFamily ?? 'Helvetica',
          color: signatureConfig.textColor ?? '#000000',
          fontSize: 14,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 160,
        }}
      >
        {(signatureConfig.signerName ?? '').trim() || t('certSign.collab.signRequest.preview.textFallback', 'Signature')}
      </div>
    ) : (
      <div className={styles.signingPreviewFrame}>
        {signatureConfig.signatureData ? (
          <img
            src={signatureConfig.signatureData}
            alt={t('certSign.collab.signRequest.preview.imageAlt', 'Selected signature')}
            style={{ maxWidth: 160, maxHeight: 32, objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <Text size="xs" c="dimmed">
            {t('certSign.collab.signRequest.preview.missing', 'No preview')}
          </Text>
        )}
      </div>
    );

  return (
    <div className={styles.signStrip} data-open={visible ? 'true' : 'false'}>
      <div className={styles.signStripInner}>
        <div className={styles.signingRow}>
          <div className={styles.signingLeft}>
            <Text size="sm" fw={700} className={styles.signingTitle}>
              {t('certSign.collab.signRequest.signingTitle', 'Signing')}
            </Text>
          </div>

          <div className={styles.signingCenter} aria-hidden="true" />

          <div className={styles.signingMode}>
            <SegmentedControl
              className={styles.signStripModeRadio}
              value={placementMode ? 'place' : 'move'}
              onChange={(value) => {
                if (value === 'place') resumePlacement();
                else pausePlacement();
              }}
              data={[
                {
                  value: 'place',
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <DrawIcon sx={{ fontSize: '1.1rem' }} />
                      <span>{t('certSign.collab.signRequest.mode.place', 'Place Signature')}</span>
                    </Group>
                  ),
                },
                {
                  value: 'move',
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <OpenWithIcon sx={{ fontSize: '1.1rem' }} />
                      <span>{t('certSign.collab.signRequest.mode.move', 'Move Signature')}</span>
                    </Group>
                  ),
                },
              ]}
              size="xs"
              radius="xl"
              aria-label={t('certSign.collab.signRequest.mode.title', 'Sign or move mode')}
            />
          </div>

          <div className={styles.signingRight}>
            <Menu
              withinPortal
              position="bottom-end"
              shadow="md"
              styles={{
                dropdown: {
                  paddingTop: 0,
                  paddingBottom: 0,
                },
              }}
            >
              <Menu.Target>
                <button
                  type="button"
                  className={styles.signingPreviewButton}
                  aria-label={t('certSign.collab.signRequest.changeSignature', 'Change signature')}
                >
                  {previewNode}
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                {sortedSavedSignatures.length ? (
                  sortedSavedSignatures.map((sig) => (
                    <Menu.Item key={sig.id} onClick={() => applySavedSignature(sig)}>
                      <Group gap="sm" wrap="nowrap">
                        {renderSavedSignaturePreview(sig)}
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} style={{ lineHeight: 1.1 }}>
                            {sig.label || t('certSign.collab.signRequest.saved.defaultLabel', 'Signature')}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ lineHeight: 1.1 }}>
                            {sig.type}
                          </Text>
                        </div>
                      </Group>
                    </Menu.Item>
                  ))
                ) : (
                  <Menu.Item disabled>{t('certSign.collab.signRequest.saved.none', 'No saved signatures')}</Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item onClick={() => handleCreateSignature('canvas')} disabled={isAtCapacity}>
                  <Group gap="xs">
                    <DrawIcon sx={{ fontSize: '1rem' }} />
                    <span>{t('certSign.collab.signRequest.modeTabs.draw', 'Draw')}</span>
                  </Group>
                </Menu.Item>
                <Menu.Item onClick={() => handleCreateSignature('text')} disabled={isAtCapacity}>
                  <Group gap="xs">
                    <span>{t('certSign.collab.signRequest.modeTabs.text', 'Type')}</span>
                  </Group>
                </Menu.Item>
                <Menu.Item onClick={() => handleCreateSignature('image')} disabled={isAtCapacity}>
                  <Group gap="xs">
                    <span>{t('certSign.collab.signRequest.modeTabs.image', 'Upload')}</span>
                  </Group>
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <div className={styles.signingDivider} aria-hidden="true" />

            <button
              type="button"
              className={`${styles.iconButton} ${styles.signStripMobileDelete}`}
              onClick={onDeleteSelected}
              disabled={!hasSelectedAnnotation}
              aria-label={t('certSign.collab.signRequest.deleteSelected', 'Delete selected signature')}
              title={t('certSign.collab.signRequest.deleteSelected', 'Delete selected signature')}
            >
              <DeleteOutlineIcon sx={{ fontSize: '1.2rem' }} />
            </button>

            <button
              type="button"
              className={`${styles.iconButton} ${styles.iconTextButton}`}
              onClick={onComplete}
              disabled={!canComplete}
              aria-label={t('certSign.collab.signRequest.completeAndSign', 'Complete & Sign')}
              title={t('certSign.collab.signRequest.completeAndSign', 'Complete & Sign')}
            >
              <span className={styles.actionIcon}>
                <CheckIcon sx={{ fontSize: '1.2rem' }} />
              </span>
              <span className={styles.actionLabel}>{t('certSign.collab.signRequest.completeAndSign', 'Complete & Sign')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline signature creation - Draw Canvas */}
      {createSignatureType === 'canvas' && (
        <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                {t('certSign.collab.signRequest.modeTabs.draw', 'Draw Signature')}
              </Text>
              <Button size="xs" variant="subtle" onClick={handleCancelCreate}>
                {t('cancel', 'Cancel')}
              </Button>
            </Group>
            <DrawingCanvas
              selectedColor={canvasColor}
              penSize={canvasPenSize}
              penSizeInput={canvasPenSizeInput}
              onColorSwatchClick={() => setCanvasColorPickerOpen(true)}
              onPenSizeChange={(size) => {
                setCanvasPenSize(size);
                setCanvasPenSizeInput(String(size));
              }}
              onPenSizeInputChange={(input) => {
                setCanvasPenSizeInput(input);
                const next = Number(input);
                if (Number.isFinite(next) && next > 0 && next <= 50) {
                  setCanvasPenSize(next);
                }
              }}
              onSignatureDataChange={handleCanvasSignatureChange}
              width={600}
              height={200}
            />
            <Group justify="flex-end">
              <Button onClick={handleSaveCanvas} disabled={!canvasSignatureData}>
                {t('certSign.collab.signRequest.canvas.continue', 'Continue')}
              </Button>
            </Group>
          </Stack>
        </Box>
      )}

      {/* Inline signature creation - Text Input */}
      {createSignatureType === 'text' && (
        <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                {t('certSign.collab.signRequest.modeTabs.text', 'Type Signature')}
              </Text>
              <Button size="xs" variant="subtle" onClick={handleCancelCreate}>
                {t('cancel', 'Cancel')}
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              {t('certSign.collab.signRequest.text.modalHint', 'Enter your name, then click Continue to place it on the PDF.')}
            </Text>
            <TextInputWithFont
              text={textSignerName}
              onTextChange={setTextSignerName}
              fontFamily={textFontFamily}
              onFontFamilyChange={setTextFontFamily}
              fontSize={textFontSize}
              onFontSizeChange={setTextFontSize}
              textColor={textColor}
              onTextColorChange={setTextColor}
              label={t('certSign.collab.signRequest.text.label', 'Signature Text')}
              placeholder={t('certSign.collab.signRequest.text.placeholder', 'Enter your name...')}
              fontLabel={t('certSign.collab.signRequest.text.fontLabel', 'Font')}
              fontSizeLabel={t('certSign.collab.signRequest.text.fontSizeLabel', 'Size')}
              fontSizePlaceholder={t('certSign.collab.signRequest.text.fontSizePlaceholder', '16')}
              colorLabel={t('certSign.collab.signRequest.text.colorLabel', 'Color')}
            />
            <Group justify="flex-end">
              <Button onClick={handleSaveText} disabled={!textSignerName.trim()}>
                {t('certSign.collab.signRequest.canvas.continue', 'Continue')}
              </Button>
            </Group>
          </Stack>
        </Box>
      )}

      {/* Inline signature creation - Image Upload */}
      {createSignatureType === 'image' && (
        <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                {t('certSign.collab.signRequest.modeTabs.image', 'Upload Image')}
              </Text>
              <Button size="xs" variant="subtle" onClick={handleCancelCreate}>
                {t('cancel', 'Cancel')}
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              {t('certSign.collab.signRequest.image.hint', 'Upload a PNG or JPG image of your signature')}
            </Text>
            <Button onClick={() => fileInputRef.current?.click()}>
              {t('certSign.collab.signRequest.modeTabs.image', 'Upload Image')}
            </Button>
          </Stack>
        </Box>
      )}

      {canvasColorPickerOpen && (
        <ColorPicker
          isOpen={canvasColorPickerOpen}
          onClose={() => setCanvasColorPickerOpen(false)}
          selectedColor={canvasColor}
          onColorChange={setCanvasColor}
          title={t('certSign.collab.signRequest.canvas.colorPickerTitle', 'Choose stroke colour')}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageSelected}
      />
    </div>
  );
}
