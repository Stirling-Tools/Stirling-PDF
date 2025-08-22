import React, { useCallback, useState, useEffect } from 'react';
import { ActionIcon, Divider, Popover } from '@mantine/core';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import './rightRail/RightRail.css';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useRightRail } from '../../contexts/RightRailContext';
import { useFileContext } from '../../contexts/FileContext';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../shared/LanguageSelector';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { Tooltip } from '../shared/Tooltip';
import BulkSelectionPanel from '../pageEditor/BulkSelectionPanel';

export default function RightRail() {
  const { t } = useTranslation();
  const { toggleTheme } = useRainbowThemeContext();
  const { buttons, actions } = useRightRail();
  const topButtons = buttons.filter(b => (b.section || 'top') === 'top' && (b.visible ?? true));

  // Access PageEditor functions for page-editor-specific actions
  const { pageEditorFunctions } = useToolWorkflow();

  // CSV input state for page selection
  const [csvInput, setCsvInput] = useState<string>("");

  // File/page selection handlers that adapt to current view
  const {
    currentView,
    activeFiles,
    processedFiles,
    selectedFileIds,
    selectedPageNumbers,
    setSelectedFiles,
    setSelectedPages,
    removeFiles
  } = useFileContext();

  // Compute selection state and total items
  const getSelectionState = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      const totalItems = activeFiles.length;
      const selectedCount = selectedFileIds.length;
      return { totalItems, selectedCount };
    }

    if (currentView === 'pageEditor') {
      let totalItems = 0;
      if (activeFiles.length === 1) {
        const pf = processedFiles.get(activeFiles[0]);
        totalItems = (pf?.totalPages as number) || (pf?.pages?.length || 0);
      } else if (activeFiles.length > 1) {
        activeFiles.forEach(file => {
          const pf = processedFiles.get(file);
          totalItems += (pf?.totalPages as number) || (pf?.pages?.length || 0);
        });
      }
      const selectedCount = selectedPageNumbers.length;
      return { totalItems, selectedCount };
    }

    return { totalItems: 0, selectedCount: 0 };
  }, [currentView, activeFiles, processedFiles, selectedFileIds, selectedPageNumbers]);

  const { totalItems, selectedCount } = getSelectionState();

  const handleSelectAll = useCallback(() => {
    if (currentView === 'fileEditor' || currentView === 'viewer') {
      const allIds = activeFiles.map(f => (f as any).id || f.name);
      setSelectedFiles(allIds);
      return;
    }

    if (currentView === 'pageEditor') {
      let totalPages = 0;
      if (activeFiles.length === 1) {
        const pf = processedFiles.get(activeFiles[0]);
        totalPages = (pf?.totalPages as number) || (pf?.pages?.length || 0);
      } else if (activeFiles.length > 1) {
        activeFiles.forEach(file => {
          const pf = processedFiles.get(file);
          totalPages += (pf?.totalPages as number) || (pf?.pages?.length || 0);
        });
      }

      if (totalPages > 0) {
        setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
      }
    }
  }, [currentView, activeFiles, processedFiles, setSelectedFiles, setSelectedPages]);

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
      const filesToDownload = selectedCount > 0 
        ? activeFiles.filter(f => selectedFileIds.includes((f as any).id || f.name))
        : activeFiles;
      
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
  }, [currentView, selectedCount, activeFiles, selectedFileIds, pageEditorFunctions]);

  const handleCloseSelected = useCallback(() => {
    if (currentView !== 'fileEditor') return;
    if (selectedCount === 0) return;

    const fileIdsToClose = activeFiles.filter(f => selectedFileIds.includes((f as any).id || f.name))
      .map(f => (f as any).id || f.name);

    if (fileIdsToClose.length === 0) return;

    // Close only selected files (do not delete from storage)
    removeFiles(fileIdsToClose, false);

    // Update selection state to remove closed ids
    setSelectedFiles(selectedFileIds.filter(id => !fileIdsToClose.includes(id)));
  }, [currentView, selectedCount, activeFiles, selectedFileIds, removeFiles, setSelectedFiles]);

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
    const pageNumbers = parseCSVInput(csvInput);
    setSelectedPages(pageNumbers);
  }, [csvInput, parseCSVInput, setSelectedPages]);

  // Sync csvInput with selectedPageNumbers changes
  useEffect(() => {
    const sortedPageNumbers = [...selectedPageNumbers].sort((a, b) => a - b);
    const newCsvInput = sortedPageNumbers.join(', ');
    setCsvInput(newCsvInput);
  }, [selectedPageNumbers]);

  // Clear CSV input when files change
  useEffect(() => {
    setCsvInput("");
  }, [activeFiles]);

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
            <Tooltip content={t('pageEdit.selectAll', 'Select All')} position="left" offset={12} arrow>
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
            <Tooltip content={t('pageEdit.deselectAll', 'Deselect All')} position="left" offset={12} arrow>
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
                                  <Tooltip content={t('pageEdit.selectByNumber', 'Select by Page Numbers')} position="left" offset={12} arrow>

              <div className={`right-rail-fade ${pageControlsVisible ? 'enter' : 'exit'}`} aria-hidden={!pageControlsVisible}>
                <Popover position="left" withArrow shadow="md" offset={8}>
                  <Popover.Target>
                      <div style={{ display: 'inline-flex' }}>
                        <ActionIcon
                          variant="subtle"
                          radius="md"
                          className="right-rail-icon"
                          disabled={!pageControlsVisible || totalItems === 0}
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
                        selectedPages={selectedPageNumbers}
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
                              <Tooltip content={t('pageEdit.deleteSelected', 'Delete Selected Pages')} position="left" offset={12} arrow>

              <div className={`right-rail-fade ${pageControlsVisible ? 'enter' : 'exit'}`} aria-hidden={!pageControlsVisible}>
                  <div style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      variant="subtle"
                      radius="md"
                      className="right-rail-icon"
                      onClick={() => pageEditorFunctions?.handleDelete?.()}
                      disabled={!pageControlsVisible || selectedCount === 0}
                    >
                      <span className="material-symbols-rounded">delete</span>
                    </ActionIcon>
                  </div>
              </div>
              </Tooltip>

            )}

            {/* Close (File Editor: Close Selected | Page Editor: Close PDF) */}
            <Tooltip content={currentView === 'pageEditor' ? 'Close PDF' : 'Close Selected Files'} position="left" offset={12} arrow>
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
          <Tooltip content={t('app.toggleTheme', 'Toggle Theme')} position="left" offset={12} arrow>
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
              ? 'Export All Pages' 
              : (selectedCount > 0 ? 'Download Selected Files' : 'Download All')
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


