import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { ActionIcon, Divider, Popover } from '@mantine/core';
import LocalIcon from './LocalIcon';
import './rightRail/RightRail.css';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useRightRail } from '../../contexts/RightRailContext';
import { useFileState, useFileSelection, useFileManagement } from '../../contexts/FileContext';
import { useNavigationState } from '../../contexts/NavigationContext';
import { useTranslation } from 'react-i18next';

import LanguageSelector from '../shared/LanguageSelector';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { Tooltip } from '../shared/Tooltip';
import BulkSelectionPanel from '../pageEditor/BulkSelectionPanel';
import { SearchInterface } from '../viewer/SearchInterface';
import { ViewerContext } from '../../contexts/ViewerContext';

import { parseSelection } from '../../utils/bulkselection/parseSelection';


export default function RightRail() {
  const { t } = useTranslation();
  const [isPanning, setIsPanning] = useState(false);

  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);
  const { toggleTheme } = useRainbowThemeContext();
  const { buttons, actions } = useRightRail();
  const topButtons = useMemo(() => buttons.filter(b => (b.section || 'top') === 'top' && (b.visible ?? true)), [buttons]);

  // Access PageEditor functions for page-editor-specific actions
  const { pageEditorFunctions } = useToolWorkflow();

  // CSV input state for page selection
  const [csvInput, setCsvInput] = useState<string>("");

  // Navigation view
  const { workbench: currentView } = useNavigationState();

  // File state and selection
  const { state, selectors } = useFileState();
  const { selectedFiles, selectedFileIds, setSelectedFiles } = useFileSelection();
  const { removeFiles } = useFileManagement();

  const activeFiles = selectors.getFiles();
  const filesSignature = selectors.getFilesSignature();

  // Compute selection state and total items
  const getSelectionState = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      const totalItems = activeFiles.length;
      const selectedCount = selectedFileIds.length;
      return { totalItems, selectedCount };
    }

    if (currentView === 'pageEditor') {
      // Use PageEditor's own state
      const totalItems = pageEditorFunctions?.totalPages || 0;
      const selectedCount = pageEditorFunctions?.selectedPageIds?.length || 0;
      return { totalItems, selectedCount };
    }

    return { totalItems: 0, selectedCount: 0 };
  }, [currentView, activeFiles, selectedFileIds, pageEditorFunctions]);

  const { totalItems, selectedCount } = getSelectionState();

  const handleSelectAll = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      // Select all file IDs
      const allIds = state.files.ids;
      setSelectedFiles(allIds);
      return;
    }

    if (currentView === 'pageEditor') {
      // Use PageEditor's select all function
      pageEditorFunctions?.handleSelectAll?.();
    }
  }, [currentView, state.files.ids, setSelectedFiles, pageEditorFunctions]);

  const handleDeselectAll = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      setSelectedFiles([]);
      return;
    }
    if (currentView === 'pageEditor') {
      // Use PageEditor's deselect all function
      pageEditorFunctions?.handleDeselectAll?.();
    }
  }, [currentView, setSelectedFiles, pageEditorFunctions]);

  const handleExportAll = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      // Download selected files (or all if none selected)
      const filesToDownload = selectedFiles.length > 0 ? selectedFiles : activeFiles;

      filesToDownload.forEach(file => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      });
    } else if (currentView === 'pageEditor') {
      // Export all pages (not just selected)
      pageEditorFunctions?.onExportAll?.();
    }
  }, [currentView, activeFiles, selectedFiles, pageEditorFunctions]);

  const handleCloseSelected = useCallback(() => {
    if (currentView !== 'fileEditor') return;
    if (selectedFileIds.length === 0) return;

    // Close only selected files (do not delete from storage)
    removeFiles(selectedFileIds, false);

    // Clear selection after closing
    setSelectedFiles([]);
  }, [currentView, selectedFileIds, removeFiles, setSelectedFiles]);

  const updatePagesFromCSV = useCallback((override?: string) => {
    const maxPages = pageEditorFunctions?.totalPages || 0;
    const normalized = parseSelection(override ?? csvInput, maxPages);
    pageEditorFunctions?.handleSetSelectedPages?.(normalized);
  }, [csvInput, pageEditorFunctions]);

  // Do not overwrite user's expression input when selection changes.

  // Clear CSV input when files change (use stable signature to avoid ref churn)
  useEffect(() => {
    setCsvInput("");
  }, [filesSignature]);

  // Mount/visibility for page-editor-only buttons to allow exit animation, then remove to avoid flex gap
  const [pageControlsMounted, setPageControlsMounted] = useState<boolean>(currentView === 'pageEditor');
  const [pageControlsVisible, setPageControlsVisible] = useState<boolean>(currentView === 'pageEditor');

  useEffect(() => {
    if (currentView === 'pageEditor') {
      // Mount and show
      setPageControlsMounted(true);
      // Next tick to ensure transition applies
      requestAnimationFrame(() => setPageControlsVisible(true));
    } else {
      // Start exit animation
      setPageControlsVisible(false);
      // After transition, unmount to remove flex gap
      const timer = setTimeout(() => setPageControlsMounted(false), 240);
      return () => clearTimeout(timer);
    }
  }, [currentView]);

  return (
    <div className="right-rail">
      <div className="right-rail-inner">
        {topButtons.length > 0 && (
          <>
            <div className="right-rail-section">
              {topButtons.map(btn => (
                <Tooltip key={btn.id} content={btn.tooltip} position="left" offset={12} arrow>
                  <ActionIcon
                    variant="subtle"
                    radius="md"
                    className="right-rail-icon"
                    onClick={() => actions[btn.id]?.()}
                    disabled={btn.disabled}
                  >
                    {btn.icon}
                  </ActionIcon>
                </Tooltip>
              ))}
            </div>
            <Divider className="right-rail-divider" />
          </>
        )}

        {/* Group: PDF Viewer Controls - visible only in viewer mode */}
        <div
          className={`right-rail-slot ${currentView === 'viewer' ? 'visible right-rail-enter' : 'right-rail-exit'}`}
          aria-hidden={currentView !== 'viewer'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            {/* Search */}
            <Tooltip content={t('rightRail.search', 'Search PDF')} position="left" offset={12} arrow>
              <Popover position="left" withArrow shadow="md" offset={8}>
                <Popover.Target>
                  <div style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      variant="subtle"
                      radius="md"
                      className="right-rail-icon"
                      disabled={currentView !== 'viewer'}
                      aria-label={typeof t === 'function' ? t('rightRail.search', 'Search PDF') : 'Search PDF'}
                    >
                      <LocalIcon icon="search" width="1.5rem" height="1.5rem" />
                    </ActionIcon>
                  </div>
                </Popover.Target>
                <Popover.Dropdown>
                  <div style={{ minWidth: '20rem' }}>
                    <SearchInterface
                      visible={true}
                      onClose={() => {}}
                    />
                  </div>
                </Popover.Dropdown>
              </Popover>
            </Tooltip>


            {/* Pan Mode */}
            <Tooltip content={t('rightRail.panMode', 'Pan Mode')} position="left" offset={12} arrow>
              <ActionIcon
                variant={isPanning ? "filled" : "subtle"}
                color={isPanning ? "blue" : undefined}
                radius="md"
                className="right-rail-icon"
                onClick={() => {
                  viewerContext?.panActions.togglePan();
                  setIsPanning(!isPanning);
                }}
                disabled={currentView !== 'viewer'}
              >
                <LocalIcon icon="pan-tool-rounded" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </Tooltip>

            {/* Rotate Left */}
            <Tooltip content={t('rightRail.rotateLeft', 'Rotate Left')} position="left" offset={12} arrow>
              <ActionIcon
                variant="subtle"
                radius="md"
                className="right-rail-icon"
                onClick={() => {
                  viewerContext?.rotationActions.rotateBackward();
                }}
                disabled={currentView !== 'viewer'}
              >
                <LocalIcon icon="rotate-left" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </Tooltip>

            {/* Rotate Right */}
            <Tooltip content={t('rightRail.rotateRight', 'Rotate Right')} position="left" offset={12} arrow>
              <ActionIcon
                variant="subtle"
                radius="md"
                className="right-rail-icon"
                onClick={() => {
                  viewerContext?.rotationActions.rotateForward();
                }}
                disabled={currentView !== 'viewer'}
              >
                <LocalIcon icon="rotate-right" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </Tooltip>

            {/* Sidebar Toggle */}
            <Tooltip content={t('rightRail.toggleSidebar', 'Toggle Sidebar')} position="left" offset={12} arrow>
              <ActionIcon
                variant="subtle"
                radius="md"
                className="right-rail-icon"
                onClick={() => {
                  viewerContext?.toggleThumbnailSidebar();
                }}
                disabled={currentView !== 'viewer'}
              >
                <LocalIcon icon="view-list" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </Tooltip>
          </div>
          <Divider className="right-rail-divider" />
        </div>

        {/* Group: Selection controls + Close, animate as one unit when entering/leaving viewer */}
        <div
          className={`right-rail-slot ${currentView !== 'viewer' ? 'visible right-rail-enter' : 'right-rail-exit'}`}
          aria-hidden={currentView === 'viewer'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            {/* Select All Button */}
            <Tooltip content={t('rightRail.selectAll', 'Select All')} position="left" offset={12} arrow>
              <div>
                <ActionIcon
                  variant="subtle"
                  radius="md"
                  className="right-rail-icon"
                  onClick={handleSelectAll}
                  disabled={currentView === 'viewer' || totalItems === 0 || selectedCount === totalItems}
                >
                  <LocalIcon icon="select-all" width="1.5rem" height="1.5rem" />
                </ActionIcon>
              </div>
            </Tooltip>

            {/* Deselect All Button */}
            <Tooltip content={t('rightRail.deselectAll', 'Deselect All')} position="left" offset={12} arrow>
              <div>
                <ActionIcon
                  variant="subtle"
                  radius="md"
                  className="right-rail-icon"
                  onClick={handleDeselectAll}
                  disabled={currentView === 'viewer' || selectedCount === 0}
                >
                  <LocalIcon icon="crop-square-outline" width="1.5rem" height="1.5rem" />
                </ActionIcon>
              </div>
            </Tooltip>

            {/* Select by Numbers - page editor only, with animated presence */}
            {pageControlsMounted && (
                                  <Tooltip content={t('rightRail.selectByNumber', 'Select by Page Numbers')} position="left" offset={12} arrow>

              <div className={`right-rail-fade ${pageControlsVisible ? 'enter' : 'exit'}`} aria-hidden={!pageControlsVisible}>
                <Popover position="left" withArrow shadow="md" offset={8}>
                  <Popover.Target>
                      <div style={{ display: 'inline-flex' }}>
                        <ActionIcon
                          variant="subtle"
                          radius="md"
                          className="right-rail-icon"
                          disabled={!pageControlsVisible || totalItems === 0}
                          aria-label={typeof t === 'function' ? t('rightRail.selectByNumber', 'Select by Page Numbers') : 'Select by Page Numbers'}
                        >
                          <LocalIcon icon="pin-end" width="1.5rem" height="1.5rem" />
                        </ActionIcon>
                      </div>
                  </Popover.Target>
                  <Popover.Dropdown>

                    <div style={{ minWidth: '24rem', maxWidth: '32rem' }}>
                      <BulkSelectionPanel
                        csvInput={csvInput}
                        setCsvInput={setCsvInput}
                        selectedPageIds={Array.isArray(pageEditorFunctions?.selectedPageIds) ? pageEditorFunctions.selectedPageIds : []}
                        displayDocument={pageEditorFunctions?.displayDocument}
                        onUpdatePagesFromCSV={updatePagesFromCSV}
                      />
                    </div>
                  </Popover.Dropdown>
                </Popover>
              </div>
              </Tooltip>

            )}

            {/* Delete Selected Pages - page editor only, with animated presence */}
            {pageControlsMounted && (
                              <Tooltip content={t('rightRail.deleteSelected', 'Delete Selected Pages')} position="left" offset={12} arrow>

              <div className={`right-rail-fade ${pageControlsVisible ? 'enter' : 'exit'}`} aria-hidden={!pageControlsVisible}>
                  <div style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      variant="subtle"
                      radius="md"
                      className="right-rail-icon"
                      onClick={() => { pageEditorFunctions?.handleDelete?.(); }}
                      disabled={!pageControlsVisible || (pageEditorFunctions?.selectedPageIds?.length || 0) === 0}
                      aria-label={typeof t === 'function' ? t('rightRail.deleteSelected', 'Delete Selected Pages') : 'Delete Selected Pages'}
                    >
                      <LocalIcon icon="delete-outline-rounded" width="1.5rem" height="1.5rem" />
                    </ActionIcon>
                  </div>
              </div>
              </Tooltip>

            )}

            {/* Export Selected Pages - page editor only */}
            {pageControlsMounted && (
              <Tooltip content={t('rightRail.exportSelected', 'Export Selected Pages')} position="left" offset={12} arrow>
                <div className={`right-rail-fade ${pageControlsVisible ? 'enter' : 'exit'}`} aria-hidden={!pageControlsVisible}>
                  <div style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      variant="subtle"
                      radius="md"
                      className="right-rail-icon"
                      onClick={() => { pageEditorFunctions?.onExportSelected?.(); }}
                      disabled={!pageControlsVisible || (pageEditorFunctions?.selectedPageIds?.length || 0) === 0 || pageEditorFunctions?.exportLoading}
                      aria-label={typeof t === 'function' ? t('rightRail.exportSelected', 'Export Selected Pages') : 'Export Selected Pages'}
                    >
                      <LocalIcon icon="download" width="1.5rem" height="1.5rem" />
                    </ActionIcon>
                  </div>
                </div>
              </Tooltip>
            )}

            {/* Close (File Editor: Close Selected | Page Editor: Close PDF) */}
            <Tooltip content={currentView === 'pageEditor' ? t('rightRail.closePdf', 'Close PDF') : t('rightRail.closeSelected', 'Close Selected Files')} position="left" offset={12} arrow>
              <div>
                <ActionIcon
                  variant="subtle"
                  radius="md"
                  className="right-rail-icon"
                  onClick={currentView === 'pageEditor' ? () => pageEditorFunctions?.closePdf?.() : handleCloseSelected}
                  disabled={
                    currentView === 'viewer' ||
                    (currentView === 'fileEditor' && selectedCount === 0) ||
                    (currentView === 'pageEditor' && (activeFiles.length === 0 || !pageEditorFunctions?.closePdf))
                  }
                >
                  <LocalIcon icon="close-rounded" width="1.5rem" height="1.5rem" />
                </ActionIcon>
              </div>
            </Tooltip>
          </div>

          <Divider className="right-rail-divider" />
        </div>

        {/* Theme toggle and Language dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Tooltip content={t('rightRail.toggleTheme', 'Toggle Theme')} position="left" offset={12} arrow>
            <ActionIcon
              variant="subtle"
              radius="md"
              className="right-rail-icon"
              onClick={toggleTheme}
            >
              <LocalIcon icon="contrast" width="1.5rem" height="1.5rem" />
            </ActionIcon>
          </Tooltip>

          <LanguageSelector position="left-start" offset={6} compact />

          <Tooltip content={
            currentView === 'pageEditor'
              ? t('rightRail.exportAll', 'Export PDF')
              : (selectedCount > 0 ? t('rightRail.downloadSelected', 'Download Selected Files') : t('rightRail.downloadAll', 'Download All'))
          } position="left" offset={12} arrow>
            <div>
              <ActionIcon
                variant="subtle"
                radius="md"
                className="right-rail-icon"
                onClick={handleExportAll}
                disabled={currentView === 'viewer' || totalItems === 0}
              >
                <LocalIcon icon="download" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </div>
          </Tooltip>
        </div>

        <div className="right-rail-spacer" />
      </div>
    </div>
  );
}


