import React, { useState } from "react";
import { ActionIcon, Stack, Tooltip } from "@mantine/core";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AppsIcon from "@mui/icons-material/Apps";
import SettingsIcon from "@mui/icons-material/Settings";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import rainbowStyles from '../../styles/rainbow.module.css';
import AppConfigModal from './AppConfigModal';

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
  const [configModalOpen, setConfigModalOpen] = useState(false);

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

        {/* Config Modal Button (for testing) */}
        <div className="flex flex-col items-center gap-1">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={() => setConfigModalOpen(true)}
          >
            <SettingsIcon sx={{ fontSize: 20 }} />
          </ActionIcon>
          <span className="text-xs text-center leading-tight" style={{ color: 'var(--text-secondary)' }}>Config</span>
        </div>
      </Stack>

      <AppConfigModal
        opened={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
      />
    </div>
  );
};

export default QuickAccessBar;