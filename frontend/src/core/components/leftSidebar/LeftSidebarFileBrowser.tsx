import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import { Text } from '@mantine/core';
import { useGoogleDrivePicker } from '@app/hooks/useGoogleDrivePicker';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useFileManager } from '@app/hooks/useFileManager';
import { useAllFiles, useFileManagement } from '@app/contexts/FileContext';
import { StirlingFileStub } from '@app/types/fileContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useIsMobile } from '@app/hooks/useIsMobile';
import { fileStorage } from '@app/services/fileStorage';
import MobileUploadModal from '@app/components/shared/MobileUploadModal';
import { GoogleDriveIcon, OneDriveIcon, DropboxIcon, MobileUploadIcon } from '@app/components/leftSidebar/BrandIcons';

import { SidebarSection } from '@app/components/leftSidebar/SidebarSection';
import { SourceActionItem } from '@app/components/leftSidebar/SourceActionItem';
import { WatchFolderItem, WatchFolder } from '@app/components/leftSidebar/WatchFolderItem';
import { SidebarFileItem } from '@app/components/leftSidebar/SidebarFileItem';

const DUMMY_WATCH_FOLDERS: WatchFolder[] = [
  { id: '1', name: 'Contracts', pipeline: 'Redact + Watermark', outputPath: '~/Documents/Contracts/Processed', active: true },
  { id: '2', name: 'Invoices', pipeline: 'OCR + Extract', outputPath: '~/Documents/Invoices/Extracted', active: true },
  { id: '3', name: 'Security Docs', pipeline: 'Compress + Encrypt', outputPath: '~/Security/Compressed', active: false },
];

function HiddenFileInput({
  inputRef,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      style={{ display: 'none' }}
      onChange={(e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) onFiles(files);
        e.target.value = '';
      }}
    />
  );
}

export function LeftSidebarFileBrowser() {
  const { t } = useTranslation();
  const { openFilesModal, onFileUpload, onRecentFileSelect } = useFilesModalContext();
  const { loadRecentFiles } = useFileManager();
  const { fileIds: activeFileIds } = useAllFiles();
  const { removeFiles } = useFileManagement();
  const { isEnabled: isGoogleDriveEnabled, openPicker: openGoogleDrivePicker } = useGoogleDrivePicker();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const isMobileUploadEnabled = config?.enableMobileScanner && !isMobile;
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false);

  const [recentFiles, setRecentFiles] = useState<StirlingFileStub[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshFiles = useCallback(async () => {
    const files = await loadRecentFiles();
    setRecentFiles(files);
  }, [loadRecentFiles]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles, activeFileIds.length]);

  // Re-hydrate whenever IndexedDB storage changes (add, delete, clear)
  useEffect(() => {
    return fileStorage.onStorageChange(refreshFiles);
  }, [refreshFiles]);

  const handleFilesSelected = (files: File[]) => {
    onFileUpload(files);
    refreshFiles();
  };

  const handleGoogleDriveClick = async () => {
    if (!isGoogleDriveEnabled) return;
    try {
      const files = await openGoogleDrivePicker({ multiple: true });
      if (files.length > 0) {
        onFileUpload(files);
        refreshFiles();
      }
    } catch (err) {
      console.error('Google Drive pick failed:', err);
    }
  };

  // Toggle: active files get removed from workbench (kept in storage), inactive get added
  const handleFileClick = (file: StirlingFileStub) => {
    if (activeFileIds.includes(file.id)) {
      removeFiles([file.id], false);
    } else {
      onRecentFileSelect([file]);
    }
  };

  return (
    <>
      <div className="left-sidebar-sticky-search">
        <SourceActionItem
          icon={<SearchRoundedIcon sx={{ fontSize: '1rem' }} />}
          label={t('leftSidebar.search', 'Search')}
          onClick={() => openFilesModal()}
        />
      </div>
      <div className="left-sidebar-source-actions">
        <SourceActionItem
          icon={<ComputerRoundedIcon sx={{ fontSize: '1rem' }} />}
          label={t('leftSidebar.openFromComputer', 'Open from computer')}
          onClick={() => fileInputRef.current?.click()}
        />
        <SourceActionItem
          icon={<FolderOpenRoundedIcon sx={{ fontSize: '1rem' }} />}
          label={t('leftSidebar.workInFolder', 'Work in a folder')}
          onClick={() => openFilesModal()}
        />
        <SourceActionItem
          icon={(hovered) => <GoogleDriveIcon colored={hovered} size={16} />}
          label={t('leftSidebar.googleDrive', 'Google Drive')}
          onClick={handleGoogleDriveClick}
          disabled={!isGoogleDriveEnabled}
        />
        <SourceActionItem
          icon={(hovered) => <OneDriveIcon colored={hovered} size={16} />}
          label={t('leftSidebar.oneDrive', 'OneDrive')}
          onClick={() => {}}
          disabled
        />
        <SourceActionItem
          icon={(hovered) => <DropboxIcon colored={hovered} size={16} />}
          label={t('leftSidebar.dropbox', 'Dropbox')}
          onClick={() => {}}
          disabled
        />
        <SourceActionItem
          icon={(hovered) => <MobileUploadIcon colored={hovered} size={16} />}
          label={t('leftSidebar.mobileUpload', 'Mobile Upload')}
          onClick={() => setMobileUploadOpen(true)}
          disabled={!isMobileUploadEnabled}
        />
      </div>

      <MobileUploadModal
        opened={mobileUploadOpen}
        onClose={() => setMobileUploadOpen(false)}
        onFilesReceived={(files) => { onFileUpload(files); refreshFiles(); }}
      />

      <div className="left-sidebar-divider" />

      <SidebarSection label={t('leftSidebar.watchFolders', 'Watch Folders')} onViewAll={() => {}}>
        {DUMMY_WATCH_FOLDERS.map((folder) => (
          <WatchFolderItem key={folder.id} folder={folder} />
        ))}
      </SidebarSection>

      <div className="left-sidebar-divider" />

      <SidebarSection
        label={t('leftSidebar.files', 'Files')}
        fileCount={recentFiles.length}
        onAdd={() => fileInputRef.current?.click()}
        onExpand={() => openFilesModal()}
      >
        {recentFiles.length === 0 ? (
          <div style={{ padding: '0.5rem 0.75rem' }}>
            <Text size="xs" c="dimmed">{t('leftSidebar.noFiles', 'No recent files')}</Text>
          </div>
        ) : (
          <>
            {recentFiles.slice(0, 15).map((file) => (
              <SidebarFileItem
                key={file.id}
                file={file}
                isActive={activeFileIds.includes(file.id)}
                onClick={() => handleFileClick(file)}
              />
            ))}
            {recentFiles.length > 15 && (
              <button
                className="left-sidebar-view-all-files"
                onClick={() => openFilesModal()}
              >
                {t('leftSidebar.viewAllFiles', 'View all {{count}} files →', { count: recentFiles.length })}
              </button>
            )}
          </>
        )}
      </SidebarSection>

      <HiddenFileInput inputRef={fileInputRef} onFiles={handleFilesSelected} />
    </>
  );
}
