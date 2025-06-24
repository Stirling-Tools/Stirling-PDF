import React from "react";
import { ActionIcon, Stack, Tooltip } from "@mantine/core";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AppsIcon from "@mui/icons-material/Apps";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import rainbowStyles from '../../styles/rainbow.module.css';

interface QuickAccessBarProps {
  onToolsClick: () => void;
  onReaderToggle: () => void;
  selectedToolKey?: string;
  toolRegistry: any;
  leftPanelView: 'toolPicker' | 'toolContent';
  readerMode: boolean;
}

const QuickAccessBar = ({
  onToolsClick,
  onReaderToggle,
  selectedToolKey,
  toolRegistry,
  leftPanelView,
  readerMode,
}: QuickAccessBarProps) => {
  const { isRainbowMode } = useRainbowThemeContext();

  return (
    <div
      className={`h-screen flex flex-col w-20 ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
      style={{ 
        padding: '1rem 0.5rem',
        backgroundColor: 'var(--bg-muted)'
      }}
    >
      <Stack gap="lg" align="center" className="flex-1">
        {/* All Tools Button */}
        <div className="flex flex-col items-center gap-1">
          <ActionIcon
            size="xl"
            variant={leftPanelView === 'toolPicker' && !readerMode ? "filled" : "subtle"}
            onClick={onToolsClick}
          >
            <AppsIcon sx={{ fontSize: 28 }} />
          </ActionIcon>
          <span className="text-xs text-center leading-tight" style={{ color: 'var(--text-secondary)' }}>Tools</span>
        </div>

        {/* Reader Mode Button */}
        <div className="flex flex-col items-center gap-1">
          <ActionIcon
            size="xl"
            variant={readerMode ? "filled" : "subtle"}
            onClick={onReaderToggle}
          >
            <MenuBookIcon sx={{ fontSize: 28 }} />
          </ActionIcon>
          <span className="text-xs text-center leading-tight" style={{ color: 'var(--text-secondary)' }}>Read</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />
      </Stack>
    </div>
  );
};

export default QuickAccessBar;