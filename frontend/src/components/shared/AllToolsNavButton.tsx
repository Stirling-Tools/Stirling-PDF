import React, { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import AppsIcon from '@mui/icons-material/AppsRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';

interface AllToolsNavButtonProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
}

const AllToolsNavButton: React.FC<AllToolsNavButtonProps> = ({ activeButton, setActiveButton }) => {
  const { selectedTool, selectedToolKey, handleReaderToggle, handleBackToTools } = useToolWorkflow();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    setActiveButton('tools');
    // Preserve existing behavior used in QuickAccessBar header
    handleReaderToggle();
    handleBackToTools();
  };

  const isActive = activeButton === 'tools';

  const iconNode = (() => {
    if (selectedToolKey) {
      if (isHovered) return <ArrowBackIcon sx={{ fontSize: '1.75rem' }} />;
      return (
        <span className="iconContainer">
          {selectedTool?.icon ?? <AppsIcon sx={{ fontSize: '1.75rem' }} />}
        </span>
      );
    }
    return (
      <span className="iconContainer">
        <AppsIcon sx={{ fontSize: '1.75rem' }} />
      </span>
    );
  })();

  return (
    <Tooltip label={selectedToolKey && isHovered ? 'Back to all tools' : 'View all available tools'} position="right">
      <div className="flex flex-col items-center gap-1 mt-4 mb-2">
        <ActionIcon
          size="lg"
          variant="subtle"
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            backgroundColor: isActive ? 'var(--icon-tools-bg)' : 'var(--icon-inactive-bg)',
            color: isActive ? 'var(--icon-tools-color)' : 'var(--icon-inactive-color)',
            border: 'none',
            borderRadius: '8px',
          }}
          className={isActive ? 'activeIconScale' : ''}
        >
          {iconNode}
        </ActionIcon>
        <span className={`all-tools-text ${isActive ? 'active' : 'inactive'}`}>
          All Tools
        </span>
      </div>
    </Tooltip>
  );
};

export default AllToolsNavButton;


