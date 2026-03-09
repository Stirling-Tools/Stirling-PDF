import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import { WorkbenchType } from '@app/types/workbench';
import { useViewer } from '@app/contexts/ViewerContext';
import { FileId } from '@app/types/file';
import { useFileActions } from '@app/contexts/FileContext';
import { useRightRail } from '@app/contexts/RightRailContext';
import type { RightRailRenderContext } from '@app/types/rightRail';
import { Tooltip } from '@app/components/shared/Tooltip';
import '@app/components/layout/WorkbenchBar.css';

// Slider zones:
//   0         = fileEditor  (active files)
//   1  – 49   = pageEditor  — 3 discrete stops: 6-up | 4-up | 2-up
//   50 – 100  = viewer      (50 = 100% zoom, 100 = 200% zoom)

// Discrete page-editor steps (slider value → column count → label)
const PAGE_EDITOR_STEPS = [
  { sliderValue: 10, columns: 6, label: '6-up' },
  { sliderValue: 25, columns: 4, label: '4-up' },
  { sliderValue: 40, columns: 2, label: '2-up' },
] as const;

// Which step does this slider value map to?
function sliderToPageEditorStep(val: number) {
  if (val <= 17)  return PAGE_EDITOR_STEPS[0]; // 6-up
  if (val <= 33)  return PAGE_EDITOR_STEPS[1]; // 4-up
  return            PAGE_EDITOR_STEPS[2];       // 2-up
}

// Which step does this column count map to (closest)?
function columnsToPageEditorStep(columns: number) {
  return PAGE_EDITOR_STEPS.reduce((closest, step) =>
    Math.abs(step.columns - columns) < Math.abs(closest.columns - columns) ? step : closest
  );
}

const VIEWER_ZOOM_MIN = 100; // slider 50
const VIEWER_ZOOM_MAX = 200; // slider 100

function sliderToViewerZoomPercent(val: number): number {
  const t = (val - 50) / 50;
  return Math.round(VIEWER_ZOOM_MIN + t * (VIEWER_ZOOM_MAX - VIEWER_ZOOM_MIN));
}

function viewerZoomPercentToSlider(pct: number): number {
  const t = (pct - VIEWER_ZOOM_MIN) / (VIEWER_ZOOM_MAX - VIEWER_ZOOM_MIN);
  return Math.round(50 + t * 50);
}

interface WorkbenchBarProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  activeFiles: Array<{ fileId: string; name: string }>;
  activeFileIndex: number;
  onFileSelect?: (index: number) => void;
  /** Controlled page-editor column count (2, 4, or 6) */
  pageEditorColumns: number;
  onPageEditorColumnsChange: (columns: number) => void;
}

export default function WorkbenchBar({
  currentView,
  setCurrentView,
  activeFiles,
  activeFileIndex,
  onFileSelect,
  pageEditorColumns,
  onPageEditorColumnsChange,
}: WorkbenchBarProps) {
  const { t } = useTranslation();
  const {
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
    triggerImmediateZoomUpdate,
    zoomActions,
    scrollActions,
    getZoomState,
  } = useViewer();
  const { actions: fileActions } = useFileActions();

  // --- Viewer real-time state ---
  const [viewerZoomPct, setViewerZoomPct] = useState(() => getZoomState().zoomPercent);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const unsub = registerImmediateZoomUpdate((pct) => setViewerZoomPct(pct));
    return unsub;
  }, [registerImmediateZoomUpdate]);

  useEffect(() => {
    const unsub = registerImmediateScrollUpdate((page, total) => {
      setCurrentPage(page);
      setTotalPages(total);
    });
    return unsub;
  }, [registerImmediateScrollUpdate]);

  // --- Derive slider value from current mode ---
  const getSliderForCurrentState = useCallback((): number => {
    if (currentView === 'fileEditor') return 0;
    if (currentView === 'pageEditor') return columnsToPageEditorStep(pageEditorColumns).sliderValue;
    if (currentView === 'viewer') return viewerZoomPercentToSlider(Math.max(VIEWER_ZOOM_MIN, Math.min(VIEWER_ZOOM_MAX, viewerZoomPct)));
    return 50;
  }, [currentView, pageEditorColumns, viewerZoomPct]);

  const [sliderValue, setSliderValue] = useState(() => getSliderForCurrentState());

  // Sync slider when external view/zoom changes (not from slider itself)
  const isDragging = useRef(false);
  useEffect(() => {
    if (!isDragging.current) {
      setSliderValue(getSliderForCurrentState());
    }
  }, [getSliderForCurrentState]);

  // --- Slider change handler ---
  const pendingModeSwitch = useRef<WorkbenchType | null>(null);

  const handleSliderChange = (rawVal: number) => {
    setSliderValue(rawVal);

    if (rawVal === 0) {
      if (currentView !== 'fileEditor') {
        pendingModeSwitch.current = 'fileEditor';
        setCurrentView('fileEditor');
      }
    } else if (rawVal >= 1 && rawVal <= 49) {
      if (currentView !== 'pageEditor') {
        pendingModeSwitch.current = 'pageEditor';
        setCurrentView('pageEditor');
      }
      // Snap to nearest discrete column step
      const step = sliderToPageEditorStep(rawVal);
      setSliderValue(step.sliderValue); // snap thumb
      onPageEditorColumnsChange(step.columns);
      return; // skip setSliderValue below
    } else if (rawVal >= 50 && rawVal <= 100) {
      if (currentView !== 'viewer') {
        pendingModeSwitch.current = 'viewer';
        setCurrentView('viewer');
      }
      const zoomPct = sliderToViewerZoomPercent(rawVal);
      triggerImmediateZoomUpdate(zoomPct);
      zoomActions.requestZoom(zoomPct / 100);
    }
  };

  // --- Dynamic right-rail buttons (moved from RightRail) ---
  const { buttons: railButtons, actions: railActions, allButtonsDisabled } = useRightRail();
  const topButtons = railButtons.filter(btn => (btn.section ?? 'top') === 'top' && (btn.visible ?? true));

  const renderDynamicButton = (btn: typeof railButtons[number]) => {
    const action = railActions[btn.id];
    const disabled = Boolean(btn.disabled || allButtonsDisabled);
    const isActive = Boolean(btn.active);
    const triggerAction = () => { if (!disabled) action?.(); };

    if (btn.render) {
      const ctx: RightRailRenderContext = { id: btn.id, disabled, allButtonsDisabled, action, triggerAction, active: isActive };
      const rendered = btn.render(ctx);
      return rendered ? <div key={btn.id} className="workbench-bar-btn-wrap">{rendered}</div> : null;
    }

    if (!btn.icon) return null;

    const ariaLabel = btn.ariaLabel || (typeof btn.tooltip === 'string' ? btn.tooltip : undefined);
    const buttonEl = (
      <button
        key={btn.id}
        className={`workbench-bar-icon-btn${isActive ? ' workbench-bar-icon-btn--active' : ''}`}
        onClick={triggerAction}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={isActive ? true : undefined}
      >
        {btn.icon}
      </button>
    );

    if (btn.tooltip) {
      return (
        <Tooltip
          key={btn.id}
          content={btn.tooltip}
          position="bottom"
          offset={6}
          portalTarget={typeof document !== 'undefined' ? document.body : undefined}
        >
          <div className="workbench-bar-btn-wrap">{buttonEl}</div>
        </Tooltip>
      );
    }

    return buttonEl;
  };

  // --- File picker dropdown ---
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const filePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filePickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filePickerRef.current && !filePickerRef.current.contains(e.target as Node)) {
        setFilePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filePickerOpen]);

  const handleFilePickerSelect = (index: number) => {
    setFilePickerOpen(false);
    onFileSelect?.(index);
  };

  const handleFilePickerRemove = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    fileActions.removeFiles([fileId as FileId], false);
  };

  // --- Left section info ---
  const currentFile = activeFiles[activeFileIndex];
  const fileName = currentFile?.name ?? '';
  const fileCount = activeFiles.length;

  const renderLeftInfo = () => {
    if (currentView === 'viewer') {
      const hasMultipleFiles = activeFiles.length > 1;
      return (
        <div className="workbench-bar-file-picker" ref={filePickerRef}>
          <button
            className={`workbench-bar-filename-btn${hasMultipleFiles ? ' workbench-bar-filename-btn--clickable' : ''}`}
            onClick={() => hasMultipleFiles && setFilePickerOpen(o => !o)}
            disabled={!hasMultipleFiles}
            aria-haspopup="listbox"
            aria-expanded={filePickerOpen}
          >
            <InsertDriveFileRoundedIcon sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="workbench-bar-filename">{fileName}</span>
            {totalPages > 0 && (
              <span className="workbench-bar-meta">
                &nbsp;·&nbsp;{totalPages}&nbsp;{t('workbenchBar.pages', 'pages')}&nbsp;·
              </span>
            )}
            {hasMultipleFiles && (
              <ExpandMoreRoundedIcon
                sx={{
                  fontSize: '1rem',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  transition: 'transform 0.15s ease',
                  transform: filePickerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            )}
          </button>

          {filePickerOpen && (
            <div className="workbench-bar-file-dropdown" role="listbox">
              {activeFiles.map((file, index) => (
                <div
                  key={file.fileId}
                  className={`workbench-bar-file-dropdown-item${index === activeFileIndex ? ' workbench-bar-file-dropdown-item--active' : ''}`}
                  role="option"
                  aria-selected={index === activeFileIndex}
                  onClick={() => handleFilePickerSelect(index)}
                >
                  <InsertDriveFileRoundedIcon sx={{ fontSize: '0.85rem', flexShrink: 0, opacity: 0.7 }} />
                  <span className="workbench-bar-file-dropdown-name">{file.name}</span>
                  <button
                    className="workbench-bar-file-dropdown-remove"
                    onClick={(e) => handleFilePickerRemove(e, file.fileId)}
                    aria-label={t('workbenchBar.removeFile', 'Remove file')}
                  >
                    <CloseRoundedIcon sx={{ fontSize: '0.75rem' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (currentView === 'pageEditor') {
      return (
        <>
          <InsertDriveFileRoundedIcon sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} />
          <span className="workbench-bar-meta">
            {fileCount}&nbsp;{t('workbenchBar.files', 'files')}
          </span>
        </>
      );
    }
    // fileEditor
    return (
      <>
        <InsertDriveFileRoundedIcon sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} />
        <span className="workbench-bar-meta">
          {fileCount}&nbsp;{fileCount === 1 ? t('workbenchBar.file', 'file') : t('workbenchBar.files', 'files')}
        </span>
      </>
    );
  };

  // --- Zoom label ---
  const renderZoomLabel = () => {
    if (currentView === 'viewer') {
      return `${Math.round(viewerZoomPct)}%`;
    }
    if (currentView === 'pageEditor') {
      return columnsToPageEditorStep(pageEditorColumns).label;
    }
    return t('workbenchBar.files', 'Files');
  };

  // --- Delete active file ---
  const handleDelete = () => {
    if (currentFile) {
      fileActions.removeFiles([currentFile.fileId as FileId], false);
    }
  };

  return (
    <div className="workbench-bar">
      {/* Left section */}
      <div className="workbench-bar-left">
        <button
          className="workbench-bar-icon-btn workbench-bar-grid-btn"
          onClick={() => setCurrentView('fileEditor')}
          title={t('workbenchBar.activeFiles', 'Active files')}
          aria-label={t('workbenchBar.activeFiles', 'Active files')}
        >
          <GridViewRoundedIcon sx={{ fontSize: '0.9rem' }} />
        </button>
        {renderLeftInfo()}
      </div>

      {/* Right section */}
      <div className="workbench-bar-right">
        {/* Dynamic context buttons (from RightRail) */}
        {topButtons.length > 0 && (
          <div className="workbench-bar-dynamic-btns">
            {topButtons.map(btn => renderDynamicButton(btn))}
          </div>
        )}

        {/* Action buttons */}
        <div className="workbench-bar-actions">
          <button
            className="workbench-bar-icon-btn"
            title={t('workbenchBar.delete', 'Remove from workbench')}
            aria-label={t('workbenchBar.delete', 'Remove from workbench')}
            onClick={handleDelete}
            disabled={!currentFile}
          >
            <DeleteRoundedIcon sx={{ fontSize: '1.2rem' }} />
          </button>
          <button
            className="workbench-bar-icon-btn"
            title={t('workbenchBar.download', 'Download')}
            aria-label={t('workbenchBar.download', 'Download')}
          >
            <DownloadRoundedIcon sx={{ fontSize: '1.2rem' }} />
          </button>
        </div>

        {/* Page navigation (viewer only) */}
        {currentView === 'viewer' && totalPages > 0 && (
          <div className="workbench-bar-page-nav">
            <button
              className="workbench-bar-icon-btn"
              onClick={() => scrollActions.scrollToPreviousPage()}
              aria-label={t('workbenchBar.prevPage', 'Previous page')}
              disabled={currentPage <= 1}
            >
              <ChevronLeftRoundedIcon sx={{ fontSize: '1rem' }} />
            </button>
            <span className="workbench-bar-page-indicator">
              {currentPage}/{totalPages}
            </span>
            <button
              className="workbench-bar-icon-btn"
              onClick={() => scrollActions.scrollToNextPage()}
              aria-label={t('workbenchBar.nextPage', 'Next page')}
              disabled={currentPage >= totalPages}
            >
              <ChevronRightRoundedIcon sx={{ fontSize: '1rem' }} />
            </button>
          </div>
        )}

        {/* Zoom slider */}
        <div className="workbench-bar-zoom">
          <div className="workbench-bar-zoom-pill">
            <button
              className="workbench-bar-zoom-pill-btn"
              onClick={() => {
                if (currentView === 'pageEditor') {
                  const idx = PAGE_EDITOR_STEPS.findIndex(s => s.columns === pageEditorColumns);
                  const nextIdx = Math.min(PAGE_EDITOR_STEPS.length - 1, idx < 0 ? 1 : idx + 1);
                  handleSliderChange(PAGE_EDITOR_STEPS[nextIdx].sliderValue);
                } else {
                  handleSliderChange(Math.max(0, sliderValue - 2));
                }
              }}
              aria-label={t('workbenchBar.zoomOut', 'Zoom out')}
            >
              <ZoomOutRoundedIcon sx={{ fontSize: '0.95rem' }} />
            </button>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sliderValue}
              className="workbench-bar-slider"
              style={{ '--fill-pct': `${sliderValue}%` } as React.CSSProperties}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              onMouseDown={() => { isDragging.current = true; }}
              onMouseUp={() => { isDragging.current = false; }}
              onTouchStart={() => { isDragging.current = true; }}
              onTouchEnd={() => { isDragging.current = false; }}
              aria-label={t('workbenchBar.viewZoomSlider', 'View and zoom control')}
            />

            <button
              className="workbench-bar-zoom-pill-btn"
              onClick={() => {
                if (currentView === 'pageEditor') {
                  const idx = PAGE_EDITOR_STEPS.findIndex(s => s.columns === pageEditorColumns);
                  const nextIdx = Math.max(0, idx < 0 ? 1 : idx - 1);
                  handleSliderChange(PAGE_EDITOR_STEPS[nextIdx].sliderValue);
                } else {
                  handleSliderChange(Math.min(100, sliderValue + 2));
                }
              }}
              aria-label={t('workbenchBar.zoomIn', 'Zoom in')}
            >
              <ZoomInRoundedIcon sx={{ fontSize: '0.95rem' }} />
            </button>
          </div>

          <span className="workbench-bar-zoom-label">{renderZoomLabel()}</span>
        </div>
      </div>
    </div>
  );
}
