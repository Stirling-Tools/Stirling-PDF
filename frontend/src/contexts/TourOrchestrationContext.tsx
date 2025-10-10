import React, { createContext, useContext, useCallback } from 'react';
import { useFileHandler } from '../hooks/useFileHandler';
import { useFilesModalContext } from './FilesModalContext';
import { useNavigationActions } from './NavigationContext';
import { useToolWorkflow } from './ToolWorkflowContext';

interface TourOrchestrationContextType {
  // Tool selection
  selectCropTool: () => void;

  // File operations
  loadSampleFile: () => Promise<void>;

  // View switching
  switchToViewer: () => void;
  switchToPageEditor: () => void;
  switchToActiveFiles: () => void;

  // File selection
  selectFirstFile: () => void;

  // Crop settings (placeholder for now)
  modifyCropSettings: () => void;

  // Tool execution
  executeTool: () => void;

  // Undo operation
  undoOperation: () => void;
}

const TourOrchestrationContext = createContext<TourOrchestrationContextType | undefined>(undefined);

export const TourOrchestrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addFiles } = useFileHandler();
  const { closeFilesModal } = useFilesModalContext();
  const { actions: navActions } = useNavigationActions();
  const { handleToolSelect } = useToolWorkflow();

  const selectCropTool = useCallback(() => {
    handleToolSelect('crop');
  }, [handleToolSelect]);

  const loadSampleFile = useCallback(async () => {
    try {
      const response = await fetch('/samples/crop_test.pdf');
      const blob = await response.blob();
      const file = new File([blob], 'crop_test.pdf', { type: 'application/pdf' });

      await addFiles([file]);
      closeFilesModal();
    } catch (error) {
      console.error('Failed to load sample file:', error);
    }
  }, [addFiles, closeFilesModal]);

  const switchToViewer = useCallback(() => {
    navActions.setWorkbench('viewer');
  }, [navActions]);

  const switchToPageEditor = useCallback(() => {
    navActions.setWorkbench('pageEditor');
  }, [navActions]);

  const switchToActiveFiles = useCallback(() => {
    navActions.setWorkbench('fileEditor');
  }, [navActions]);

  const selectFirstFile = useCallback(() => {
    // File selection is handled by FileCard onClick
    // This function could trigger a click event on the first file card
    const firstFileCard = document.querySelector('[data-tour="file-card-checkbox"]') as HTMLElement;
    if (firstFileCard) {
      firstFileCard.click();
    }
  }, []);

  const modifyCropSettings = useCallback(() => {
    // Placeholder for crop settings modification
    // Will be implemented with actual crop parameter manipulation
    console.log('Modify crop settings');
  }, []);

  const executeTool = useCallback(() => {
    // Trigger the run button click
    const runButton = document.querySelector('[data-tour="run-button"]') as HTMLElement;
    if (runButton) {
      runButton.click();
    }
  }, []);

  const undoOperation = useCallback(() => {
    // Trigger the undo button click
    const undoButton = document.querySelector('[data-tour="undo-button"]') as HTMLElement;
    if (undoButton) {
      undoButton.click();
    }
  }, []);

  const value: TourOrchestrationContextType = {
    selectCropTool,
    loadSampleFile,
    switchToViewer,
    switchToPageEditor,
    switchToActiveFiles,
    selectFirstFile,
    modifyCropSettings,
    executeTool,
    undoOperation,
  };

  return (
    <TourOrchestrationContext.Provider value={value}>
      {children}
    </TourOrchestrationContext.Provider>
  );
};

export const useTourOrchestration = (): TourOrchestrationContextType => {
  const context = useContext(TourOrchestrationContext);
  if (!context) {
    throw new Error('useTourOrchestration must be used within TourOrchestrationProvider');
  }
  return context;
};
