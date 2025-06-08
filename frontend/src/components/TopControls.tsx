import React from "react";
import { Button, SegmentedControl } from "@mantine/core";
import { useMantineColorScheme } from "@mantine/core";
import LanguageSelector from "./LanguageSelector";
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
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

const TopControls: React.FC<TopControlsProps> = ({
  currentView,
  setCurrentView,
}) => {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <div className="absolute left-0 w-full top-0 z-[9999] pointer-events-none">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto flex gap-2 items-center">
        <Button
          onClick={toggleColorScheme}
          variant="subtle"
          size="md"
          aria-label="Toggle theme"
        >
          {colorScheme === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
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
          />
      </div>
    </div>
  );
};

export default TopControls;
