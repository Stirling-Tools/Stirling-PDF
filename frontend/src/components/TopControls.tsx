import React from "react";
import { Button, SegmentedControl } from "@mantine/core";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import LanguageSelector from "./LanguageSelector";
import rainbowStyles from '../styles/rainbow.module.css';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { Group } from "@mantine/core";

const VIEW_OPTIONS = [
  {
    label: (
      <Group gap={5}>
        <VisibilityIcon fontSize="small" />
      </Group>
    ),
    value: "viewer",
  },
  {
    label: (
      <Group gap={4}>
        <EditNoteIcon fontSize="small" />
      </Group>
    ),
    value: "pageEditor",
  },
  {
    label: (
      <Group gap={4}>
        <InsertDriveFileIcon fontSize="small" />
      </Group>
    ),
    value: "fileManager",
  },
];

interface TopControlsProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

const TopControls = ({
  currentView,
  setCurrentView,
}: TopControlsProps) => {
  const { themeMode, isRainbowMode, isToggleDisabled, toggleTheme } = useRainbowThemeContext();

  const getThemeIcon = () => {
    if (isRainbowMode) return <AutoAwesomeIcon className={rainbowStyles.rainbowText} />;
    if (themeMode === "dark") return <LightModeIcon />;
    return <DarkModeIcon />;
  };

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto flex gap-2 items-center">
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
      <div className="flex justify-center items-center h-full pointer-events-auto">
          <SegmentedControl
            data={VIEW_OPTIONS}
            value={currentView}
            onChange={setCurrentView}
            color="blue"
            radius="xl"
            size="md"
            fullWidth
            className={isRainbowMode ? rainbowStyles.rainbowSegmentedControl : ''}
          />
      </div>
    </div>
  );
};

export default TopControls;
