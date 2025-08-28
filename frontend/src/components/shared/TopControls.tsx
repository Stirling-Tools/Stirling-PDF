import React, { useState, useCallback } from "react";
import { SegmentedControl, Loader } from "@mantine/core";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import rainbowStyles from '../../styles/rainbow.module.css';
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderIcon from "@mui/icons-material/Folder";
import { WorkbenchType, isValidWorkbench } from '../../types/workbench';
import { Tooltip } from "./Tooltip";

const viewOptionStyle = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
  paddingTop: '0.3rem',
}


// Build view options showing text only for current view; others icon-only with tooltip
const createViewOptions = (currentView: WorkbenchType, switchingTo: WorkbenchType | null) => [
  {
    label: (
      <div style={viewOptionStyle as React.CSSProperties}>
        {switchingTo === "viewer" ? (
          <Loader size="xs" />
        ) : (
          <VisibilityIcon fontSize="small" />
        )}
        <span>Viewer</span>
      </div>
    ),
    value: "viewer",
  },
  {
    label: (
      <Tooltip content="Page Editor" position="bottom" arrow={true}>
        <div style={viewOptionStyle as React.CSSProperties}>
          {currentView === "pageEditor" ? (
            <>
              {switchingTo === "pageEditor" ? <Loader size="xs" /> : <EditNoteIcon fontSize="small" />}
              <span>Page Editor</span>
            </>
          ) : (
            switchingTo === "pageEditor" ? <Loader size="xs" /> : <EditNoteIcon fontSize="small" />
          )}
        </div>
      </Tooltip>
    ),
    value: "pageEditor",
  },
  {
    label: (
      <Tooltip content="Active Files" position="bottom" arrow={true}>
        <div style={viewOptionStyle as React.CSSProperties}>
          {currentView === "fileEditor" ? (
            <>
              {switchingTo === "fileEditor" ? <Loader size="xs" /> : <FolderIcon fontSize="small" />}
              <span>Active Files</span>
            </>
          ) : (
            switchingTo === "fileEditor" ? <Loader size="xs" /> : <FolderIcon fontSize="small" />
          )}
        </div>
      </Tooltip>
    ),
    value: "fileEditor",
  },
];

interface TopControlsProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  selectedToolKey?: string | null;
}

const TopControls = ({
  currentView,
  setCurrentView,
  selectedToolKey,
}: TopControlsProps) => {
  const { isRainbowMode } = useRainbowThemeContext();
  const [switchingTo, setSwitchingTo] = useState<WorkbenchType | null>(null);

  const isToolSelected = selectedToolKey !== null;

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

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      {!isToolSelected && (
        <div className="flex justify-center mt-[0.5rem]">
            <SegmentedControl
              data={createViewOptions(currentView, switchingTo)}
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
                  borderRadius: 9999,
                  maxHeight: '2.6rem',
                },
                control: {
                  borderRadius: 9999,
                },
                indicator: {
                  borderRadius: 9999,
                  maxHeight: '2rem',
                },
                label: {
                  paddingTop: '0rem',
                }
              }}
            />
        </div>
      )}
    </div>
  );
};

export default TopControls;
