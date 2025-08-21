import React, { useState, useCallback } from "react";
import { Button, SegmentedControl, Loader } from "@mantine/core";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import LanguageSelector from "./LanguageSelector";
import rainbowStyles from '../../styles/rainbow.module.css';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderIcon from "@mui/icons-material/Folder";
import { Group } from "@mantine/core";
import { isViewType, ViewType } from "../../types/fileContext";

// This will be created inside the component to access switchingTo
const createViewOptions = (switchingTo: string | null) => [
  {
    label: (
      <Group gap={5}>
        {switchingTo === "viewer" ? (
          <Loader size="xs" />
        ) : (
          <VisibilityIcon fontSize="small" />
        )}
      </Group>
    ),
    value: "viewer",
  },
  {
    label: (
      <Group gap={4}>
        {switchingTo === "pageEditor" ? (
          <Loader size="xs" />
        ) : (
          <EditNoteIcon fontSize="small" />
        )}
      </Group>
    ),
    value: "pageEditor",
  },
  {
    label: (
      <Group gap={4}>
        {switchingTo === "fileEditor" ? (
          <Loader size="xs" />
        ) : (
          <FolderIcon fontSize="small" />
        )}
      </Group>
    ),
    value: "fileEditor",
  },
];

interface TopControlsProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  selectedToolKey?: string | null;
}

const TopControls = ({
  currentView,
  setCurrentView,
  selectedToolKey,
}: TopControlsProps) => {
  const { themeMode, isRainbowMode, isToggleDisabled, toggleTheme } = useRainbowThemeContext();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const isToolSelected = selectedToolKey !== null;

  const handleViewChange = useCallback((view: ViewType) => {
    // Show immediate feedback
    setSwitchingTo(view);

    // Defer the heavy view change to next frame so spinner can render
    requestAnimationFrame(() => {
      // Give the spinner one more frame to show
      requestAnimationFrame(() => {
        setCurrentView(view);

        // Clear the loading state after view change completes
        setTimeout(() => setSwitchingTo(null), 300);
      });
    });
  }, [setCurrentView]);

  const getThemeIcon = () => {
    if (isRainbowMode) return <AutoAwesomeIcon className={rainbowStyles.rainbowText} />;
    if (themeMode === "dark") return <LightModeIcon />;
    return <DarkModeIcon />;
  };

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      <div className={`absolute left-4 pointer-events-auto flex gap-2 items-center ${
        isToolSelected ? 'top-4' : 'top-1/2 -translate-y-1/2'
      }`}>
        <Button
          onClick={toggleTheme}
          variant="subtle"
          size="md"
          aria-label="Toggle theme"
          disabled={isToggleDisabled}
          className={isRainbowMode ? rainbowStyles.rainbowButton : ''}
          title={
            isToggleDisabled
              ? "Button disabled for 3 seconds..."
              : isRainbowMode
                ? "Rainbow Mode Active! Click to exit"
                : "Toggle theme (click rapidly 6 times for a surprise!)"
          }
          style={isToggleDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
        >
          {getThemeIcon()}
        </Button>
        <LanguageSelector />
      </div>
      {!isToolSelected && (
        <div className="flex justify-center items-center h-full pointer-events-auto">
            <SegmentedControl
              data={createViewOptions(switchingTo)}
              value={currentView}
              onChange={(value) => isViewType(value) && handleViewChange}
              color="blue"
              radius="xl"
              size="md"
              fullWidth
              className={isRainbowMode ? rainbowStyles.rainbowSegmentedControl : ''}
              style={{
                transition: 'all 0.2s ease',
                opacity: switchingTo ? 0.8 : 1,
              }}
            />
        </div>
      )}
    </div>
  );
};

export default TopControls;
