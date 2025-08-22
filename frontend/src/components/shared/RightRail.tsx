import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { ActionIcon, Divider, Popover } from '@mantine/core';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
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

export default function RightRail() {
  const { t } = useTranslation();
  const { toggleTheme } = useRainbowThemeContext();
  const { buttons, actions } = useRightRail();
  const topButtons = useMemo(() => buttons.filter(b => (b.section || 'top') === 'top' && (b.visible ?? true)), [buttons]);

  // Access PageEditor functions for page-editor-specific actions
  const { pageEditorFunctions } = useToolWorkflow();

  // CSV input state for page selection
  const [csvInput, setCsvInput] = useState<string>("");

  // Navigation view
  const { currentMode: currentView } = useNavigationState();

  // File state and selection
  const { state, selectors } = useFileState();
  const { selectedFiles, selectedFileIds, selectedPageNumbers, setSelectedFiles, setSelectedPages } = useFileSelection();
  const { removeFiles } = useFileManagement();

  const activeFiles = selectors.getFiles();
  const filesSignature = selectors.getFilesSignature();
  const fileRecords = selectors.getFileRecords();

  // Compute selection state and total items
  const getSelectionState = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      const totalItems = activeFiles.length;
      const selectedCount = selectedFileIds.length;
      return { totalItems, selectedCount };
    }

    if (currentView === 'pageEditor') {
      let totalItems = 0;
      fileRecords.forEach(rec => {
        const pf = rec.processedFile;
        if (pf) {
          totalItems += (pf.totalPages as number) || (pf.pages?.length || 0);
        }
      });
      const selectedCount = Array.isArray(selectedPageNumbers) ? selectedPageNumbers.length : 0;
      return { totalItems, selectedCount };
    }

    return { totalItems: 0, selectedCount: 0 };
  }, [currentView, activeFiles, fileRecords, selectedFileIds, selectedPageNumbers]);

  const { totalItems, selectedCount } = getSelectionState();

  const handleSelectAll = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      // Select all file IDs
      const allIds = state.files.ids;
      setSelectedFiles(allIds);
      return;
    }

    if (currentView === 'pageEditor') {
      let totalPages = 0;
      fileRecords.forEach(rec => {
        const pf = rec.processedFile;
        if (pf) {
          totalPages += (pf.totalPages as number) || (pf.pages?.length || 0);
        }
      });

      if (totalPages > 0) {
        setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
      }
    }
  }, [currentView, state.files.ids, fileRecords, setSelectedFiles, setSelectedPages]);

  const handleDeselectAll = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      setSelectedFiles([]);
      return;
    }
    if (currentView === 'pageEditor') {
      setSelectedPages([]);
    }
  }, [currentView, setSelectedFiles, setSelectedPages]);

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

  // CSV parsing functions for page selection
  const parseCSVInput = useCallback((csv: string) => {
    const pageNumbers: number[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end; i++) {
          if (i > 0) {
            pageNumbers.push(i);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0) {
          pageNumbers.push(pageNum);
        }
      }
    });

    return pageNumbers;
  }, []);

  const updatePagesFromCSV = useCallback(() => {
    const rawPages = parseCSVInput(csvInput);
    // Determine max page count from processed records
    const maxPages = fileRecords.reduce((sum, rec) => {
      const pf = rec.processedFile;
      if (!pf) return sum;
      return sum + ((pf.totalPages as number) || (pf.pages?.length || 0));
    }, 0);
    const normalized = Array.from(new Set(rawPages.filter(n => Number.isFinite(n) && n > 0 && n <= maxPages))).sort((a,b)=>a-b);
    setSelectedPages(normalized);
  }, [csvInput, parseCSVInput, fileRecords, setSelectedPages]);

  // Sync csvInput with selectedPageNumbers changes
  useEffect(() => {
    const sortedPageNumbers = Array.isArray(selectedPageNumbers)
      ? [...selectedPageNumbers].sort((a, b) => a - b)
      : [];
    const newCsvInput = sortedPageNumbers.join(', ');
    setCsvInput(newCsvInput);
  }, [selectedPageNumbers]);

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
                  <span className="material-symbols-rounded">
                    select_all
                  </span>
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
                  <span className="material-symbols-rounded">
                    crop_square
                  </span>
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
                          <span className="material-symbols-rounded">
                            pin_end
                          </span>
                        </ActionIcon>
                      </div>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <div style={{ minWidth: 280 }}>
                      <BulkSelectionPanel
                        csvInput={csvInput}
                        setCsvInput={setCsvInput}
                        selectedPages={Array.isArray(selectedPageNumbers) ? selectedPageNumbers : []}
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
                      onClick={() => { pageEditorFunctions?.handleDelete?.(); setSelectedPages([]); }}
                      disabled={!pageControlsVisible || (Array.isArray(selectedPageNumbers) ? selectedPageNumbers.length === 0 : true)}
                      aria-label={typeof t === 'function' ? t('rightRail.deleteSelected', 'Delete Selected Pages') : 'Delete Selected Pages'}
                    >
                      <span className="material-symbols-rounded">delete</span>
                    </ActionIcon>
                  </div>
              </div>
              </Tooltip>

            )}

            {/* Close (File Editor: Close Selected | Page Editor: Close PDF) */}
            <Tooltip content={currentView === 'pageEditor' ? t('rightRail.closePdf', 'Close PDF') : t('rightRail.downloadSelected', 'Download Selected Files')} position="left" offset={12} arrow>
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
                  <CloseRoundedIcon />
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
              <span className="material-symbols-rounded">contrast</span>
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
                <span className="material-symbols-rounded">
                  download
                </span>
              </ActionIcon>
            </div>
          </Tooltip>
        </div>

        <div className="right-rail-spacer" />
      </div>
    </div>
  );
}


