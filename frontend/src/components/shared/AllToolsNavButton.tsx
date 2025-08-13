import React from 'react';
import { ActionIcon } from '@mantine/core';
import { Tooltip } from './Tooltip';
import AppsIcon from '@mui/icons-material/AppsRounded';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';

interface AllToolsNavButtonProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
}

const AllToolsNavButton: React.FC<AllToolsNavButtonProps> = ({ activeButton, setActiveButton }) => {
  const { handleReaderToggle, handleBackToTools, selectedToolKey, leftPanelView } = useToolWorkflow();

  const handleClick = () => {
    setActiveButton('tools');
    // Preserve existing behavior used in QuickAccessBar header
    handleReaderToggle();
    handleBackToTools();
  };

  // Do not highlight All Tools when a specific tool is open (indicator is shown)
  const isActive = activeButton === 'tools' && !selectedToolKey && leftPanelView === 'toolPicker';

  const iconNode = (
    <span className="iconContainer">
      <AppsIcon sx={{ fontSize: '1.5rem' }} />
    </span>
  );

  return (
    
    <Tooltip content={'All tools'} position="right" arrow containerStyle={{ marginTop: "-1rem" }} maxWidth={200}>
      <div className="flex flex-col items-center gap-1 mt-4 mb-2">
        <ActionIcon
          size={'lg'}
          variant="subtle"
          onClick={handleClick}
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


