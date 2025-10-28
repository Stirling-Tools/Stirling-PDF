import React from 'react';
import { Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useFileState } from '../../contexts/FileContext';
import { useFileActions } from '../../contexts/file/fileHooks';
import CloseIcon from '@mui/icons-material/Close';

interface DismissAllErrorsButtonProps {
  className?: string;
}

const DismissAllErrorsButton: React.FC<DismissAllErrorsButtonProps> = ({ className }) => {
  const { t } = useTranslation();
  const { state } = useFileState();
  const { actions } = useFileActions();
  
  // Check if there are any files in error state
  const hasErrors = state.ui.errorFileIds.length > 0;
  
  // Don't render if there are no errors
  if (!hasErrors) {
    return null;
  }
  
  const handleDismissAllErrors = () => {
    actions.clearAllFileErrors();
  };
  
  return (
    <Group className={className}>
      <Button
        variant="light"
        color="red"
        size="sm"
        leftSection={<CloseIcon fontSize="small" />}
        onClick={handleDismissAllErrors}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 1000,
          pointerEvents: 'auto'
        }}
      >
        {t('error.dismissAllErrors', 'Dismiss All Errors')} ({state.ui.errorFileIds.length})
      </Button>
    </Group>
  );
};

export default DismissAllErrorsButton;
