import React, { useState } from "react";
import { ActionIcon, Stack, Tooltip, Divider } from "@mantine/core";
import MenuBookIcon from "@mui/icons-material/MenuBookRounded";
import AppsIcon from "@mui/icons-material/AppsRounded";
import SettingsIcon from "@mui/icons-material/SettingsRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeRounded";
import FolderIcon from "@mui/icons-material/FolderRounded";
import PersonIcon from "@mui/icons-material/PersonRounded";
import NotificationsIcon from "@mui/icons-material/NotificationsRounded";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import rainbowStyles from '../../styles/rainbow.module.css';
import AppConfigModal from './AppConfigModal';
import './QuickAccessBar.css';

interface QuickAccessBarProps {
  onToolsClick: () => void;
  onReaderToggle: () => void;
  selectedToolKey?: string;
  toolRegistry: any;
  leftPanelView: 'toolPicker' | 'toolContent';
  readerMode: boolean;
}

interface ButtonConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  tooltip: string;
  isRound?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick: () => void;
}

const actionIconStyle = {
  backgroundColor: 'var(--icon-user-bg)',
  color: 'var(--icon-user-color)',
  borderRadius: '50%',
  width: '1.5rem',
  height: '1.5rem',
};

function NavHeader() {
  return (
    <>
      <div className="flex flex-row items-center justify-center mb-0" style={{ gap: '0.5rem' }}>
        <Tooltip label="User Profile" position="right">
          <ActionIcon
            size="md"
            variant="subtle"
            style={actionIconStyle}
          >
            <PersonIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Notifications" position="right">
          <ActionIcon
            size="md"
            variant="subtle"
            style={actionIconStyle}
          >
            <NotificationsIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>
      </div>
      {/* Divider after top icons */}
      <Divider 
        size="xs" 
        style={{ 
          width: '3.75rem',
          borderColor: 'var(--color-gray-300)'
        }}
      />
    </>
  );
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
  const [activeButton, setActiveButton] = useState<string>('tools');

  const buttonConfigs: ButtonConfig[] = [
    {
      id: 'tools',
      name: 'All Tools',
      icon: <AppsIcon sx={{ fontSize: 26 }} />,
      tooltip: 'View all available tools',
      size: 'lg',
      isRound: false,
      onClick: () => {
        setActiveButton('tools');
        onReaderToggle();
        onToolsClick();
      }
    },
    {
      id: 'read',
      name: 'Read',
      icon: <MenuBookIcon sx={{ fontSize: 20 }} />,
      tooltip: 'Read documents',
      size: 'lg',
      isRound: false,
      onClick: () => {
        setActiveButton('read');
        onReaderToggle();
      }
    },
    {
      id: 'sign',
      name: 'Sign',
      icon: 
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
        signature
      </span>,
      tooltip: 'Sign your document',
      size: 'lg',
      isRound: false,
      onClick: () => setActiveButton('sign')
    },
    {
      id: 'automate',
      name: 'Automate',
      icon: <AutoAwesomeIcon sx={{ fontSize: 20 }} />,
      tooltip: 'Automate workflows',
      size: 'lg',
      isRound: false,
      onClick: () => setActiveButton('automate')
    },
    {
      id: 'files',
      name: 'Files',
      icon: <FolderIcon sx={{ fontSize: 20 }} />,
      tooltip: 'Manage files',
      isRound: true,
      size: 'lg',
      onClick: () => setActiveButton('files')
    },
    {
      id: 'activity',
      name: 'Activity',
      icon: 
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
      vital_signs
      </span>,
      tooltip: 'View activity and analytics',
      isRound: true,
      size: 'lg',
      onClick: () => setActiveButton('activity')
    },
    {
      id: 'config',
      name: 'Config',
      icon: <SettingsIcon sx={{ fontSize: 16 }} />,
      tooltip: 'Configure settings',
      size: 'lg',
      onClick: () => {
        setConfigModalOpen(true);
      }
    }
  ];

  const CIRCULAR_BORDER_RADIUS = '50%';
  const ROUND_BORDER_RADIUS = '8px';

  const getBorderRadius = (config: ButtonConfig): string => {
    return config.isRound ? CIRCULAR_BORDER_RADIUS : ROUND_BORDER_RADIUS;
  };

  const getButtonStyle = (config: ButtonConfig) => {
    const isActive = activeButton === config.id;
    
    if (isActive) {
      return {
        backgroundColor: `var(--icon-${config.id}-bg)`,
        color: `var(--icon-${config.id}-color)`,
        border: 'none',
        borderRadius: getBorderRadius(config),
      };
    }
    
    // Inactive state - use consistent inactive colors
    return {
      backgroundColor: 'var(--icon-inactive-bg)',
      color: 'var(--icon-inactive-color)',
      border: 'none',
      borderRadius: getBorderRadius(config),
    };
  };

  const getTextStyle = (config: ButtonConfig) => {
    const isActive = activeButton === config.id;
    return {
      marginTop: '0.75rem',
      fontSize: '0.75rem',
      color: isActive ? 'var(--text-primary)' : 'var(--color-gray-700)',
      fontWeight: isActive ? 'bold' : 'normal',
      textRendering: 'optimizeLegibility' as const,
      fontSynthesis: 'none' as const
    };
  };

  return (
    <div
      className={`h-screen flex flex-col w-20 quick-access-bar ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
      style={{ 
        padding: '1rem 0.5rem',
        backgroundColor: 'var(--bg-muted)',
        width: '5rem',
        minWidth: '5rem',
        maxWidth: '5rem',
        position: 'relative',
        zIndex: 10
      }}
      onWheel={(e) => {
        // Prevent the wheel event from bubbling up to parent containers
        e.stopPropagation();
      }}
    >
      <Stack gap="lg" align="center" className="flex-1">
        <NavHeader />
        {buttonConfigs.map((config, index) => (
          <React.Fragment key={config.id}>
            <Tooltip label={config.tooltip} position="right">
              <div className="flex flex-col items-center gap-1">
                <ActionIcon
                  size={config.size || 'xl'}
                  variant="subtle"
                  onClick={config.onClick}
                  style={getButtonStyle(config)}
                  className={activeButton === config.id ? 'activeIconScale' : ''}
                >
                  <span className="iconContainer">
                    {config.icon}
                  </span>
                </ActionIcon>
                <span className="text-xs text-center leading-tight" style={getTextStyle(config)}>
                  {config.name}
                </span>
              </div>
            </Tooltip>
            
            {/* Add divider after Automate button (index 3) */}
            {index === 3 && (
                <Divider 
                  size="xs" 
                  style={{ 
                    width: '3.75rem',
                    borderColor: 'var(--color-gray-300)'
                  }}
                />
            )}
            
            {/* Add spacer before Config button (index 7) */}
            {index === 5 && <div className="flex-1" />}
          </React.Fragment>
        ))}
      </Stack>

      <AppConfigModal
        opened={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
      />
    </div>
  );
};

export default QuickAccessBar;