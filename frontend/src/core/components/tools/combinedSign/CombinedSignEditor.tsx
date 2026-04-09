import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Paper, Group, Button, Text, SegmentedControl, Divider, CloseButton } from '@mantine/core';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import CheckIcon from '@mui/icons-material/Check';
import { LocalIcon } from '@app/components/shared/LocalIcon';
import { Z_INDEX_FULLSCREEN_SURFACE } from '@app/styles/zIndex';
import { LocalEmbedPDFWithAnnotations, AnnotationAPI, SignaturePreview } from '@app/components/viewer/LocalEmbedPDFWithAnnotations';
import SignControlsStrip from '@app/components/tools/certSign/SignControlsStrip';
import { CertificateConfigModal } from '@app/components/tools/certSign/modals/CertificateConfigModal';
import type { CertificateSubmitData } from '@app/components/tools/certSign/modals/CertificateConfigModal';
import { SignParameters } from '@app/hooks/tools/sign/useSignParameters';
import { useCombinedSignOperation } from '@app/hooks/tools/combinedSign/useCombinedSignOperation';
import { alert } from '@app/components/toast';
import { useIsPhone } from '@app/hooks/useIsMobile';

type SignMode = 'wet' | 'both' | 'cert';

export interface CombinedSignEditorData {
  file: File;
  onComplete: (blob: Blob, filename: string) => void;
  onBack: () => void;
}

const DEFAULT_SIGNATURE_CONFIG: SignParameters = {
  signatureType: 'canvas',
  signerName: '',
  fontFamily: 'Helvetica',
  fontSize: 16,
  textColor: '#000000',
};

/**
 * Full-screen signing editor, mirroring the SignRequestWorkbenchView layout.
 *
 * Registered as a custom workbench view by CombinedSign.tsx. Receives its
 * runtime state through the `data` prop (set via setCustomWorkbenchViewData).
 *
 * Modes:
 *  wet  — visual/wet signatures only, submitted to add-signature endpoint
 *  cert — digital certificate only, submitted to cert-sign endpoint
 *  both — wet signatures + digital cert, submitted to cert-sign with wetSignaturesData
 */
const CombinedSignEditor = ({ data }: { data: CombinedSignEditorData | null }) => {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const { submitCertSign, submitWetOnly, loading } = useCombinedSignOperation();

  const annotationApiRef = useRef<AnnotationAPI | null>(null);

  const [signMode, setSignMode] = useState<SignMode>('both');
  const [signatureConfig, setSignatureConfig] = useState<SignParameters>(DEFAULT_SIGNATURE_CONFIG);
  const [placementMode, setPlacementMode] = useState(true);
  const [previewCount, setPreviewCount] = useState(0);
  const [hasSelectedAnnotation, setHasSelectedAnnotation] = useState(false);
  const [certModalOpen, setCertModalOpen] = useState(false);

  const showWetControls = signMode === 'wet' || signMode === 'both';

  // Poll for selected annotation state (enables delete button)
  useEffect(() => {
    if (!showWetControls) {
      setHasSelectedAnnotation(false);
      return;
    }
    const check = () => {
      const has = (annotationApiRef.current as any)?.getHasSelectedAnnotation?.();
      setHasSelectedAnnotation(Boolean(has));
    };
    check();
    const id = setInterval(check, 350);
    return () => clearInterval(id);
  }, [showWetControls]);

  // Clear placed signatures when switching to cert-only mode
  useEffect(() => {
    if (signMode === 'cert') {
      annotationApiRef.current?.clearPreviews();
      setPreviewCount(0);
    }
  }, [signMode]);

  const handleComplete = useCallback(() => {
    if (!data) return;

    if (signMode === 'wet') {
      const previews = annotationApiRef.current?.getSignaturePreviews() ?? [];
      if (previews.length === 0) {
        alert({
          alertType: 'error',
          title: t('common.error'),
          body: t('sign.editor.noSignatures', 'Place at least one signature on the PDF first.'),
        });
        return;
      }
      void handleWetSign(previews);
    } else {
      // cert or both — open the certificate modal
      if (signMode === 'both' && previewCount === 0) {
        alert({
          alertType: 'error',
          title: t('common.error'),
          body: t('sign.editor.noSignatures', 'Place at least one signature on the PDF first.'),
        });
        return;
      }
      setCertModalOpen(true);
    }
  }, [data, signMode, previewCount, t]);

  const handleWetSign = async (previews: SignaturePreview[]) => {
    if (!data) return;
    try {
      const result = await submitWetOnly(data.file, previews);
      data.onComplete(result.blob, result.filename);
    } catch {
      alert({
        alertType: 'error',
        title: t('common.error'),
        body: t('sign.editor.signingFailed', 'Signing failed. Please try again.'),
      });
    }
  };

  const handleCertSign = async (
    certData: CertificateSubmitData,
    reason?: string,
    location?: string,
  ) => {
    if (!data) return;

    const formData = new FormData();
    formData.append('fileInput', data.file);

    if (certData.certType === 'UPLOAD') {
      formData.append('certType', certData.uploadFormat);
      if (certData.p12File) formData.append('p12File', certData.p12File);
      if (certData.privateKeyFile) formData.append('privateKeyFile', certData.privateKeyFile);
      if (certData.certFile) formData.append('certFile', certData.certFile);
      if (certData.jksFile) formData.append('jksFile', certData.jksFile);
      if (certData.password) formData.append('password', certData.password);
    } else {
      formData.append('certType', certData.certType);
    }

    // Appearance settings (from extended CertificateConfigModal)
    if (certData.showSignature !== undefined) {
      formData.append('showSignature', certData.showSignature.toString());
    }
    if (certData.showSignature) {
      if (certData.pageNumber !== undefined) formData.append('pageNumber', certData.pageNumber.toString());
      if (certData.showLogo !== undefined) formData.append('showLogo', certData.showLogo.toString());
    }
    if (reason?.trim()) formData.append('reason', reason);
    if (location?.trim()) formData.append('location', location);

    // Wet signatures (both mode only)
    if (signMode === 'both') {
      const previews = annotationApiRef.current?.getSignaturePreviews() ?? [];
      if (previews.length > 0) {
        const wetSignaturesJson = previews.map((p) => ({
          type: p.signatureType,
          data: p.signatureData,
          page: p.pageIndex,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        }));
        formData.append('wetSignaturesData', JSON.stringify(wetSignaturesJson));
      }
    }

    try {
      const result = await submitCertSign(data.file, formData);
      setCertModalOpen(false);
      data.onComplete(result.blob, result.filename);
    } catch {
      alert({
        alertType: 'error',
        title: t('common.error'),
        body: t('sign.editor.signingFailed', 'Signing failed. Please try again.'),
      });
    }
  };

  const handleDeleteSelected = useCallback(() => {
    (annotationApiRef.current as any)?.deleteSelectedAnnotation?.();
  }, []);

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <Paper
        p="sm"
        shadow="sm"
        style={{ flexShrink: 0, zIndex: Z_INDEX_FULLSCREEN_SURFACE, position: 'relative' }}
      >
        <Group justify="space-between" style={{ flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
          <Group gap="md">
            <LocalIcon icon="signature-rounded" width="1.5rem" height="1.5rem" />
            <Text
              size="sm"
              fw={600}
              truncate={isPhone ? 'end' : undefined}
              style={{ maxWidth: isPhone ? '140px' : undefined }}
            >
              {data.file.name}
            </Text>
          </Group>

          <Group gap="xs" style={{ width: isPhone ? '100%' : undefined }} justify={isPhone ? 'flex-end' : undefined}>
            {/* Sign mode selector */}
            <SegmentedControl
              value={signMode}
              onChange={(v) => setSignMode(v as SignMode)}
              size="xs"
              radius="xl"
              data={[
                { value: 'wet', label: t('sign.mode.wet', 'Wet Sign') },
                { value: 'both', label: t('sign.mode.both', 'Both') },
                { value: 'cert', label: t('sign.mode.cert', 'Cert Sign') },
              ]}
            />

            {!isPhone && (
              <>
                <Divider orientation="vertical" />
                <Button.Group>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => annotationApiRef.current?.zoomOut()}
                    title={t('viewer.zoomOut', 'Zoom out')}
                  >
                    <ZoomOutIcon fontSize="small" />
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => annotationApiRef.current?.resetZoom()}
                    title={t('viewer.resetZoom', 'Reset zoom')}
                  >
                    <ZoomOutMapIcon fontSize="small" />
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => annotationApiRef.current?.zoomIn()}
                    title={t('viewer.zoomIn', 'Zoom in')}
                  >
                    <ZoomInIcon fontSize="small" />
                  </Button>
                </Button.Group>
              </>
            )}

            {/* Cert-only mode: show sign button in the top bar (no strip below) */}
            {signMode === 'cert' && (
              <>
                <Divider orientation="vertical" />
                <Button
                  size="sm"
                  leftSection={<CheckIcon fontSize="small" />}
                  onClick={handleComplete}
                  loading={loading}
                >
                  {t('sign.editor.signDocument', 'Sign Document')}
                </Button>
              </>
            )}

            <Divider orientation="vertical" />
            <CloseButton
              size="md"
              onClick={data.onBack}
              title={t('sign.editor.back', 'Back to file selection')}
            />
          </Group>
        </Group>
      </Paper>

      {/* ── Wet signature controls strip (wet / both modes) ─────────────── */}
      {showWetControls && (
        <SignControlsStrip
          visible
          placementMode={placementMode}
          onPlacementModeChange={setPlacementMode}
          onSignatureSelected={setSignatureConfig}
          onComplete={handleComplete}
          canComplete={previewCount > 0}
          signatureConfig={signatureConfig}
          hasSelectedAnnotation={hasSelectedAnnotation}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      {/* ── PDF viewer ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <LocalEmbedPDFWithAnnotations
          ref={annotationApiRef}
          file={data.file}
          onAnnotationChange={() => {}}
          placementMode={showWetControls ? placementMode : false}
          signatureData={showWetControls ? signatureConfig?.signatureData : undefined}
          signatureType={showWetControls ? signatureConfig?.signatureType : undefined}
          onPlaceSignature={() => {}}
          onPreviewCountChange={setPreviewCount}
        />
      </div>

      {/* ── Certificate modal (cert / both modes) ───────────────────────── */}
      {(signMode === 'cert' || signMode === 'both') && (
        <CertificateConfigModal
          opened={certModalOpen}
          onClose={() => setCertModalOpen(false)}
          onSign={handleCertSign}
          signatureCount={previewCount}
          disabled={loading}
          showAppearanceSettings
        />
      )}
    </div>
  );
};

export default CombinedSignEditor;
