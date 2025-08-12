import React from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import AppsIcon from '@mui/icons-material/AppsRounded';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';

interface AllToolsNavButtonProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
}

const AllToolsNavButton: React.FC<AllToolsNavButtonProps> = ({ activeButton, setActiveButton }) => {
  const { handleReaderToggle, handleBackToTools } = useToolWorkflow();

  const handleClick = () => {
    setActiveButton('tools');
    // Preserve existing behavior used in QuickAccessBar header
    handleReaderToggle();
    handleBackToTools();
  };

  const isActive = activeButton === 'tools';

  const iconNode = (
    <span className="iconContainer">
      <AppsIcon sx={{ fontSize: '1.75rem' }} />
    </span>
  );

  return (
    <Tooltip label={'All tools'} position="right">
      <div className="flex flex-col items-center gap-1 mt-4 mb-2">
        <ActionIcon
          size="lg"
          variant="subtle"
          onClick={handleClick}
          style={{
            backgroundColor: isActive ? 'var(--icon-tools-bg)' : 'var(--icon-inactive-bg)',
            color: isActive ? 'var(--icon-tools-color)' : 'var(--icon-inactive-color)',
            border: 'none',
            borderRadius: '8px',
          }}
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


