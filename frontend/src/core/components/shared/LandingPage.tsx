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

const BTN_BG = 'linear-gradient(180deg, #5B9BF7 0%, #4C8BF5 50%, #3A7BE8 100%)';
const BTN_BG_HOVER = 'linear-gradient(180deg, #6BA6F8 0%, #5B9BF7 50%, #4C8BF5 100%)';
const BTN_SHADOW = '0 1px 2px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1)';

const btnBase: React.CSSProperties = {
  background: BTN_BG,
  boxShadow: BTN_SHADOW,
  border: 'none',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  borderRadius: 12,
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
};

function hoverIn(ev: React.MouseEvent<HTMLButtonElement>) {
  ev.currentTarget.style.background = BTN_BG_HOVER;
  ev.currentTarget.style.transform = 'translateY(-1px)';
}
function hoverOut(ev: React.MouseEvent<HTMLButtonElement>) {
  ev.currentTarget.style.background = BTN_BG;
  ev.currentTarget.style.transform = 'translateY(0)';
}

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
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
        <div className="landing-fade-in" style={{ textAlign: 'center', maxWidth: 540, paddingBottom: 80 }}>

          <LandingDocumentStack isDark={isDark} />

          <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {t('landing.dropAnywhere', 'Drop a PDF anywhere')}
          </h1>

          <p style={{ fontSize: 15, marginBottom: 32, paddingLeft: 16, paddingRight: 16, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {t('landing.descriptionLine1', 'Drop in a file to edit, use one of our upload options')}
            <br />
            {t('landing.descriptionLine2', 'or create a file from scratch with our')}{' '}
            <span style={{ color: '#4C8BF5', fontWeight: 600 }}>
              {t('landing.stirlingAgent', 'Stirling agent')}
            </span>
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, pointerEvents: 'auto' }}>
            <button onClick={() => openFilesModal()} style={btnBase} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <LocalIcon icon="add" width="1rem" height="1rem" style={{ color: '#FFFFFF' }} />
              {t('landing.browseFiles', 'Browse Files')}
            </button>

            <button onClick={handleNativeUploadClick} style={btnBase} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <LocalIcon icon={icons.uploadIconName} width="1rem" height="1rem" style={{ color: '#FFFFFF' }} />
              {terminology.uploadFromComputer}
            </button>

            {config?.enableMobileScanner && !isMobile && (
              <Tooltip label={t('landing.mobileUpload', 'Upload from Mobile')} position="bottom">
                <button
                  onClick={() => setMobileUploadModalOpen(true)}
                  style={{ ...btnBase, padding: 10, width: 44, height: 44, justifyContent: 'center' } as React.CSSProperties}
                  onMouseEnter={hoverIn}
                  onMouseLeave={hoverOut}
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
