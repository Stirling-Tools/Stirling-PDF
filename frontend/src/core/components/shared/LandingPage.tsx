import React from 'react';
import { useMantineColorScheme, Tooltip } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useTranslation } from 'react-i18next';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';
import { useFileActionIcons } from '@app/hooks/useFileActionIcons';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useIsMobile } from '@app/hooks/useIsMobile';
import MobileUploadModal from '@app/components/shared/MobileUploadModal';
import { openFilesFromDisk } from '@app/services/openFilesFromDisk';
import LandingDocumentStack from '@app/components/shared/LandingDocumentStack';
import '@app/components/shared/LandingPage.css';

const LandingPage = () => {
  const { addFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const [mobileUploadModalOpen, setMobileUploadModalOpen] = React.useState(false);
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const isDark = colorScheme === 'dark';

  const handleFileDrop = async (files: File[]) => { await addFiles(files); };

  const handleNativeUploadClick = async () => {
    const files = await openFilesFromDisk({
      multiple: true,
      onFallbackOpen: () => fileInputRef.current?.click()
    });
    if (files.length > 0) await addFiles(files);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) await addFiles(files);
    event.target.value = '';
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', backgroundColor: isDark ? 'var(--bg-surface)' : '#F8FAFC' }}>
      {/* Invisible Dropzone for drag-and-drop */}
      <Dropzone
        onDrop={handleFileDrop}
        multiple
        activateOnClick={false}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: 'none', backgroundColor: 'transparent', zIndex: 0 }}
      >
        <div style={{ width: '100%', height: '100%' }} />
      </Dropzone>

      {/* Visual content */}
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
        <div className="landing-fade-in" style={{ textAlign: 'center', maxWidth: 540, paddingBottom: 80 }}>

          <LandingDocumentStack isDark={isDark} />

          <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {t('landing.dropAnywhere', 'Drop a PDF anywhere')}
          </h1>

          <p style={{ fontSize: 15, marginBottom: 32, paddingLeft: 16, paddingRight: 16, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {t('landing.descriptionLine', 'Drop in a file to get started, or create a file from scratch with our')}
            <br />
            {t('landing.descriptionLine2', '')}{' '}
            <span style={{ color: '#4C8BF5', fontWeight: 600 }}>
              {t('landing.stirlingAgent', 'Stirling agent')}
            </span>
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <button type="button" onClick={() => openFilesModal()} className="landing-page-btn">
              <LocalIcon icon="add" width="1rem" height="1rem" style={{ color: '#FFFFFF' }} />
              {t('landing.browseFiles', 'Browse Files')}
            </button>

            <button type="button" onClick={handleNativeUploadClick} className="landing-page-btn">
              <LocalIcon icon={icons.uploadIconName} width="1rem" height="1rem" style={{ color: '#FFFFFF' }} />
              {terminology.uploadFromComputer}
            </button>

            {config?.enableMobileScanner && !isMobile && (
              <Tooltip label={t('landing.mobileUpload', 'Upload from Mobile')} position="bottom">
                <button
                  type="button"
                  onClick={() => setMobileUploadModalOpen(true)}
                  className="landing-page-btn landing-page-btn--icon-only"
                >
                  <LocalIcon icon="qr-code-rounded" width="1.1rem" height="1.1rem" style={{ color: '#FFFFFF' }} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />

      <MobileUploadModal
        opened={mobileUploadModalOpen}
        onClose={() => setMobileUploadModalOpen(false)}
        onFilesReceived={async (files: File[]) => { if (files.length > 0) await addFiles(files); }}
      />
    </div>
  );
};

export default LandingPage;
