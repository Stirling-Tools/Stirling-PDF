import React, { useState } from "react";
import { ActionIcon, Stack, Tooltip, Divider } from "@mantine/core";
import MenuBookIcon from "@mui/icons-material/MenuBookRounded";
import AppsIcon from "@mui/icons-material/AppsRounded";
import SettingsIcon from "@mui/icons-material/SettingsRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeRounded";
import FolderIcon from "@mui/icons-material/FolderRounded";
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
      icon: <AppsIcon sx={{ fontSize: 20 }} />,
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
    if (config.isRound && isActive) {
      return {
        backgroundColor: '#D3E7F7',
        color: '#0A8BFF',
        borderRadius: '50%',
      };
    }
    return {
      backgroundColor: isActive ? config.color : '#9CA3AF',
      color: 'white',
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
            {index === 3 && <Divider size="sm" />}
            
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