import React, { useState, useCallback } from "react";
import { SegmentedControl, Loader } from "@mantine/core";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import rainbowStyles from '../../styles/rainbow.module.css';
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderIcon from "@mui/icons-material/Folder";
import { ModeType, isValidMode } from '../../contexts/NavigationContext';

// Create view options with icons and loading states
const createViewOptions = (switchingTo: ModeType | null) => [
  {
    label: (
      <div style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'}}>
        {switchingTo === "viewer" ? (
          <Loader size="xs" />
        ) : (
          <VisibilityIcon fontSize="small" />
        )}
        <span>Read</span>
      </div>
    ),
    value: "viewer",
  },
  {
    label: (
      <div style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        {switchingTo === "pageEditor" ? (
          <Loader size="xs" />
        ) : (
          <EditNoteIcon fontSize="small" />
        )}
        <span>Page Editor</span>
      </div>
    ),
    value: "pageEditor",
  },
  {
    label: (
      <div style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        {switchingTo === "fileEditor" ? (
          <Loader size="xs" />
        ) : (
          <FolderIcon fontSize="small" />
        )}
        <span>File Manager</span>
      </div>
    ),
    value: "fileEditor",
  },
];

interface TopControlsProps {
  currentView: ModeType;
  setCurrentView: (view: ModeType) => void;
  selectedToolKey?: string | null;
}

const TopControls = ({
  currentView,
  setCurrentView,
  selectedToolKey,
}: TopControlsProps) => {
  const { isRainbowMode } = useRainbowThemeContext();
  const [switchingTo, setSwitchingTo] = useState<ModeType | null>(null);

  const isToolSelected = selectedToolKey !== null;

  const handleViewChange = useCallback((view: string) => {
    if (!isValidMode(view)) {
      // Ignore invalid values defensively
      return;
    }
    const mode = view as ModeType;

    // Show immediate feedback
    setSwitchingTo(mode as ModeType);

    // Defer the heavy view change to next frame so spinner can render
    requestAnimationFrame(() => {
      // Give the spinner one more frame to show
      requestAnimationFrame(() => {
        setCurrentView(mode as ModeType);

        // Clear the loading state after view change completes
        setTimeout(() => setSwitchingTo(null), 300);
      });
    });
  }, [setCurrentView]);

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      {!isToolSelected && (
        <div className="flex justify-center items-center h-full pointer-events-auto mt-[0.5rem] rounded-full">
            <SegmentedControl
              data={createViewOptions(switchingTo)}
              value={currentView}
              onChange={handleViewChange}
              color="blue"
              radius="xl"
              fullWidth
              className={isRainbowMode ? rainbowStyles.rainbowSegmentedControl : ''}
              style={{
                transition: 'all 0.2s ease',
                opacity: switchingTo ? 0.8 : 1,
              }}
              styles={{
                root: {
                  borderRadius: 9999,
                },
                control: {
                  borderRadius: 9999,
                },
                indicator: {
                  borderRadius: 9999,
                },
              }}
            />
        </div>
      )}
    </div>
  );
};

export default TopControls;
