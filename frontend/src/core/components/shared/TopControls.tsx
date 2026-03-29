import React, { useState, useCallback, useMemo } from "react";
import { SegmentedControl, Loader } from "@mantine/core";
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import rainbowStyles from '@app/styles/rainbow.module.css';
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import GridViewIcon from "@mui/icons-material/GridView";
import FolderIcon from "@mui/icons-material/Folder";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { WorkbenchType, isValidWorkbench } from '@app/types/workbench';
import { PageEditorFileDropdown } from '@app/components/shared/PageEditorFileDropdown';
import type { CustomWorkbenchViewInstance } from '@app/contexts/ToolWorkflowContext';
import { FileDropdownMenu } from '@app/components/shared/FileDropdownMenu';
import { usePageEditorDropdownState, PageEditorDropdownState } from '@app/components/pageEditor/hooks/usePageEditorDropdownState';
import { FileId } from '@app/types/file';
import { useWorkbenchBar } from '@app/contexts/WorkbenchBarContext';
import type { WorkbenchBarRenderContext } from '@app/types/workbenchBar';
import { Tooltip } from '@app/components/shared/Tooltip';


const viewOptionStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
  padding: '2px 1rem',
};

// Helper function to create view options for SegmentedControl
const createViewOptions = (
  currentView: WorkbenchType,
  switchingTo: WorkbenchType | null,
  activeFiles: Array<{ fileId: string; name: string; versionNumber?: number }>,
  currentFileIndex: number,
  onFileSelect?: (index: number) => void,
  onFileRemove?: (fileId: FileId) => void,
  pageEditorState?: PageEditorDropdownState,
  customViews?: CustomWorkbenchViewInstance[]
) => {
  // Viewer dropdown logic
  const currentFile = activeFiles[currentFileIndex];
  const isInViewer = currentView === 'viewer';
  const fileName = currentFile?.name || '';
  const viewerDisplayName = isInViewer && fileName ? fileName : 'Viewer';
  const showViewerDropdown = isInViewer;

  const viewerOption = {
    label: showViewerDropdown ? (
      <FileDropdownMenu
        displayName={viewerDisplayName}
        activeFiles={activeFiles}
        currentFileIndex={currentFileIndex}
        onFileSelect={onFileSelect}
        onFileRemove={onFileRemove}
        switchingTo={switchingTo}
        viewOptionStyle={viewOptionStyle}
      />
    ) : (
      <div style={viewOptionStyle}>
        {switchingTo === "viewer" ? (
          <Loader size="sm" />
        ) : (
          <InsertDriveFileIcon fontSize="medium" />
        )}
      </div>
    ),
    value: "viewer",
  };

  // Page Editor dropdown logic
  const isInPageEditor = currentView === 'pageEditor';
  const hasPageEditorFiles = pageEditorState && pageEditorState.totalCount > 0;
  const showPageEditorDropdown = isInPageEditor && hasPageEditorFiles;

  const pageEditorOption = {
    label: showPageEditorDropdown ? (
      <PageEditorFileDropdown
        files={pageEditorState!.files}
        onToggleSelection={pageEditorState!.onToggleSelection}
        onReorder={pageEditorState!.onReorder}
        switchingTo={switchingTo}
        viewOptionStyle={viewOptionStyle}
        fileColorMap={pageEditorState!.fileColorMap}
        selectedCount={pageEditorState!.selectedCount}
        totalCount={pageEditorState!.totalCount}
      />
    ) : (
      <div style={viewOptionStyle}>
        {switchingTo === "pageEditor" ? (
          <Loader size="sm" />
        ) : (
          <GridViewIcon fontSize="medium" />
        )}
      </div>
    ),
    value: "pageEditor",
  };

  const fileEditorOption = {
    label: (
      <div style={viewOptionStyle}>
        {switchingTo === "fileEditor" ? <Loader size="sm" /> : <FolderIcon fontSize="medium" />}
      </div>
    ),
    value: "fileEditor",
  };

  const baseOptions = [
    viewerOption,
    pageEditorOption,
    fileEditorOption,
  ];

  const customOptions = (customViews ?? [])
    .filter((view) => view.data != null)
    .map((view) => ({
      label: (
        <div style={viewOptionStyle as React.CSSProperties}>
          {switchingTo === view.workbenchId ? (
            <Loader size="sm" />
          ) : (
            view.icon || <PictureAsPdfIcon fontSize="medium" />
          )}
          <span>{view.label}</span>
        </div>
      ),
      value: view.workbenchId,
    }));

  return [...baseOptions, ...customOptions];
};

interface TopControlsProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  customViews?: CustomWorkbenchViewInstance[];
  activeFiles?: Array<{ fileId: string; name: string; versionNumber?: number }>;
  currentFileIndex?: number;
  onFileSelect?: (index: number) => void;
  onFileRemove?: (fileId: FileId) => void;
}

const TopControls = ({
  currentView,
  setCurrentView,
  customViews = [],
  activeFiles = [],
  currentFileIndex = 0,
  onFileSelect,
  onFileRemove,
}: TopControlsProps) => {
  const { isRainbowMode } = useRainbowThemeContext();
  const [switchingTo, setSwitchingTo] = useState<WorkbenchType | null>(null);

  const pageEditorState = usePageEditorDropdownState();

  // Dynamic buttons registered by tools via WorkbenchBarContext
  const { buttons: railButtons, actions: railActions, allButtonsDisabled } = useWorkbenchBar();
  const topButtons = railButtons.filter(btn => (btn.section ?? 'top') === 'top' && (btn.visible ?? true));

  const renderDynamicButton = (btn: typeof railButtons[number]) => {
    const action = railActions[btn.id];
    const disabled = Boolean(btn.disabled || allButtonsDisabled);
    const isActive = Boolean(btn.active);
    const triggerAction = () => { if (!disabled) action?.(); };

    if (btn.render) {
      const ctx: WorkbenchBarRenderContext = { id: btn.id, disabled, allButtonsDisabled, action, triggerAction, active: isActive };
      const rendered = btn.render(ctx);
      return rendered ? <div key={btn.id}>{rendered}</div> : null;
    }

    if (!btn.icon) return null;

    const ariaLabel = btn.ariaLabel || (typeof btn.tooltip === 'string' ? btn.tooltip : undefined);
    const buttonEl = (
      <button
        key={btn.id}
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          padding: '0 4px',
          opacity: disabled ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          color: isActive ? 'var(--mantine-color-blue-5)' : 'var(--text-secondary)',
        }}
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
          <div>{buttonEl}</div>
        </Tooltip>
      );
    }

    return buttonEl;
  };

  const handleViewChange = useCallback((view: string) => {
    if (!isValidWorkbench(view)) {
      return;
    }

    const workbench = view;

    // Show immediate feedback
    setSwitchingTo(workbench);

    // Defer the heavy view change to next frame so spinner can render
    requestAnimationFrame(() => {
      // Give the spinner one more frame to show
      requestAnimationFrame(() => {
        setCurrentView(workbench);

        // Clear the loading state after view change completes
        setTimeout(() => setSwitchingTo(null), 300);
      });
    });
  }, [setCurrentView]);

  // Memoize view options to prevent SegmentedControl re-renders
  const viewOptions = useMemo(() => createViewOptions(
    currentView,
    switchingTo,
    activeFiles,
    currentFileIndex,
    onFileSelect,
    onFileRemove,
    pageEditorState,
    customViews
  ), [currentView, switchingTo, activeFiles, currentFileIndex, onFileSelect, onFileRemove, pageEditorState, customViews]);

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      <div className="flex justify-center relative">

        <SegmentedControl
          data-tour="view-switcher"
          data={viewOptions}

          value={currentView}
          onChange={handleViewChange}
          color="blue"
          fullWidth
          className={isRainbowMode ? rainbowStyles.rainbowSegmentedControl : ''}
          style={{
            transition: 'all 0.2s ease',
            opacity: switchingTo ? 0.8 : 1,
            pointerEvents: 'auto'
          }}
          styles={{
            root: {
              borderRadius: '0 0 16px 16px',
              height: '1.8rem',
              backgroundColor: 'var(--bg-toolbar)',
              border: '1px solid var(--border-default)',
              borderTop: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              outline: '1px solid rgba(0, 0, 0, 0.1)',
              outlineOffset: '-1px',
              padding: '0 0',
              gap: '0',
            },
            control: {
              borderRadius: '0 0 16px 16px',
              padding: '0',
              border: 'none',
            },
            indicator: {
              borderRadius: '0 0 16px 16px',
              height: '100%',
              top: '0rem',
              margin: '0',
              border: 'none',
            },
            label: {
              paddingTop: '0',
              paddingBottom: '0',
            }
          }}
        />

        {/* Dynamic context buttons registered by tools */}
        {topButtons.length > 0 && (
          <div
            className="absolute right-2 top-0 flex items-center h-full gap-0.5 pointer-events-auto"
          >
            {topButtons.map(btn => renderDynamicButton(btn))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TopControls;
