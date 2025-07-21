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
  color: string;
  isRound?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick: () => void;
}

function NavHeader() {
  return (
    <>
      <div className="flex flex-row items-center justify-center mb-0">
        <Tooltip label="User Profile" position="right">
          <ActionIcon
            size="md"
            variant="subtle"
            style={{
              backgroundColor: 'var(--icon-user-bg)',
              color: 'var(--icon-user-color)',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              marginRight: '8px'
            }}
          >
            <PersonIcon sx={{ fontSize: 16 }} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Notifications" position="right">
          <ActionIcon
            size="md"
            variant="subtle"
            style={{
              backgroundColor: 'var(--icon-notifications-bg)',
              color: 'var(--icon-notifications-color)',
              borderRadius: '50%',
              width: '24px',
              height: '24px'
            }}
          >
            <NotificationsIcon sx={{ fontSize: 16 }} />
          </ActionIcon>
        </Tooltip>
      </div>
      {/* Divider after top icons */}
      <Divider 
        size="xs" 
        style={{ 
          width: '60px',
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
      color: '#1E88E5',
      size: 'lg',
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
      color: '#4CAF50',
      size: 'lg',
      onClick: () => {
        setActiveButton('read');
        onReaderToggle();
      }
    },
    {
      id: 'sign',
      name: 'Sign',
      icon: 
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
        signature
      </span>,
      tooltip: 'Sign your document',
      color: '#3BA99C',
      size: 'lg',
      onClick: () => setActiveButton('sign')
    },
    {
      id: 'automate',
      name: 'Automate',
      icon: <AutoAwesomeIcon sx={{ fontSize: 20 }} />,
      tooltip: 'Automate workflows',
      color: '#A576E3',
      size: 'lg',
      onClick: () => setActiveButton('automate')
    },
    {
      id: 'files',
      name: 'Files',
      icon: <FolderIcon sx={{ fontSize: 20 }} />,
      tooltip: 'Manage files',
      color: '', // the round icons are blue always, this logic lives in getButtonStyle
      isRound: true,
      size: 'lg',
      onClick: () => setActiveButton('files')
    },
    /* Access isn't going to be available yet */
   
    /*
    {
      id: 'access',
      name: 'Access',
      icon: <GroupIcon sx={{ fontSize: 20 }} />,
      tooltip: 'Manage access and permissions',
      color: '#00BCD4',
      isRound: true,
      size: 'lg',
      onClick: () => setActiveButton('access')
    },
    */
    {
      id: 'activity',
      name: 'Activity',
      icon: 
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
      vital_signs
      </span>,
      tooltip: 'View activity and analytics',
      color: '',
      isRound: true,
      size: 'lg',
      onClick: () => setActiveButton('activity')
    },
    {
      id: 'config',
      name: 'Config',
      icon: <SettingsIcon sx={{ fontSize: 16 }} />,
      tooltip: 'Configure settings',
      color: '#9CA3AF',
      size: 'lg',
      onClick: () => {
        setConfigModalOpen(true);
      }
    }
  ];

  const getButtonStyle = (config: ButtonConfig) => {
    const isActive = activeButton === config.id;
    
    if (isActive) {
      // Active state - use specific icon colors
      if (config.id === 'tools') {
        return {
          backgroundColor: 'var(--icon-tools-bg)',
          color: 'var(--icon-tools-color)',
          border: 'none',
          borderRadius: config.isRound ? '50%' : '8px',
        };
      }
      if (config.id === 'read') {
        return {
          backgroundColor: 'var(--icon-read-bg)',
          color: 'var(--icon-read-color)',
          border: 'none',
          borderRadius: config.isRound ? '50%' : '8px',
        };
      }
      if (config.id === 'sign') {
        return {
          backgroundColor: 'var(--icon-sign-bg)',
          color: 'var(--icon-sign-color)',
          border: 'none',
          borderRadius: config.isRound ? '50%' : '8px',
        };
      }
      if (config.id === 'automate') {
        return {
          backgroundColor: 'var(--icon-automate-bg)',
          color: 'var(--icon-automate-color)',
          border: 'none',
          borderRadius: config.isRound ? '50%' : '8px',
        };
      }
      if (config.id === 'files') {
        return {
          backgroundColor: 'var(--icon-files-bg)',
          color: 'var(--icon-files-color)',
          borderRadius: '50%',
        };
      }
      if (config.id === 'activity') {
        return {
          backgroundColor: 'var(--icon-activity-bg)',
          color: 'var(--icon-activity-color)',
          borderRadius: '50%',
        };
      }
      if (config.id === 'config') {
        return {
          backgroundColor: 'var(--icon-config-bg)',
          color: 'var(--icon-config-color)',
          border: 'none',
          borderRadius: config.isRound ? '50%' : '8px',
        };
      }
    }
    
    // Inactive state - use consistent inactive colors
    return {
      backgroundColor: 'var(--icon-inactive-bg)',
      color: 'var(--icon-inactive-color)',
      border: 'none',
      borderRadius: config.isRound ? '50%' : '8px',
    };
  };

  const getTextStyle = (config: ButtonConfig) => {
    const isActive = activeButton === config.id;
    return {
      marginTop: '12px',
      fontSize: '12px',
      color: isActive ? 'var(--text-primary)' : 'var(--color-gray-700)',
      fontWeight: isActive ? 'bold' : 'normal',
      textRendering: 'optimizeLegibility' as const,
      fontSynthesis: 'none' as const
    };
  };

  return (
    <div
      className={`h-screen flex flex-col w-20 ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
      style={{ 
        padding: '1rem 0.5rem',
        backgroundColor: 'var(--bg-muted)',
        width: '80px',
        minWidth: '80px',
        maxWidth: '80px'
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
                    width: '60px',
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