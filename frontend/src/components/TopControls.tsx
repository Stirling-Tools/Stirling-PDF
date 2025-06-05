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
      <Group gap={4}>
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
    <div
      style={{
        position: "absolute",
        left: 0,
        width: "100%",
        top: 0,
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 16,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "auto",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
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
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          pointerEvents: "auto",
        }}
      >
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