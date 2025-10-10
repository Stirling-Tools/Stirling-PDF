import React, { createContext, useContext, useCallback, useRef } from 'react';
import { useFileHandler } from '../hooks/useFileHandler';
import { useFilesModalContext } from './FilesModalContext';
import { useNavigationActions } from './NavigationContext';
import { useToolWorkflow } from './ToolWorkflowContext';
import { useAllFiles, useFileManagement } from './FileContext';
import { StirlingFile } from '../types/fileContext';

interface TourOrchestrationContextType {
  // State management
  saveWorkbenchState: () => void;
  restoreWorkbenchState: () => Promise<void>;

  // Tool deselection
  backToAllTools: () => void;

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
  const { handleToolSelect, handleBackToTools } = useToolWorkflow();
  const { files } = useAllFiles();
  const { clearAllFiles } = useFileManagement();

  // Store the user's files before tour starts
  const savedFilesRef = useRef<StirlingFile[]>([]);

  // Keep a ref to always have the latest files
  const filesRef = useRef<StirlingFile[]>(files);
  React.useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const saveWorkbenchState = useCallback(() => {
    // Get fresh files from ref
    const currentFiles = filesRef.current;
    console.log('Saving workbench state, files count:', currentFiles.length);
    savedFilesRef.current = [...currentFiles];
    // Clear all files for clean demo
    clearAllFiles();
  }, [clearAllFiles]);

  const restoreWorkbenchState = useCallback(async () => {
    console.log('Restoring workbench state, saved files count:', savedFilesRef.current.length);

    // Go back to All Tools
    handleBackToTools();

    // Clear all files (including tour sample)
    clearAllFiles();

    // Restore saved files
    if (savedFilesRef.current.length > 0) {
      // Create fresh File objects from StirlingFile to avoid ID conflicts
      const filesToRestore = await Promise.all(
        savedFilesRef.current.map(async (sf) => {
          const buffer = await sf.arrayBuffer();
          return new File([buffer], sf.name, { type: sf.type, lastModified: sf.lastModified });
        })
      );
      console.log('Restoring files:', filesToRestore.map(f => f.name));
      await addFiles(filesToRestore);
      savedFilesRef.current = [];
    }
  }, [clearAllFiles, addFiles, handleBackToTools]);

  const backToAllTools = useCallback(() => {
    handleBackToTools();
  }, [handleBackToTools]);

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
      // Check if already selected (data-selected attribute)
      const isSelected = firstFileCard.getAttribute('data-selected') === 'true';
      // Only click if not already selected (to avoid toggling off)
      if (!isSelected) {
        firstFileCard.click();
      }
    }
  }, []);

  const modifyCropSettings = useCallback(() => {
    // Dispatch a custom event to modify crop settings
    const event = new CustomEvent('tour:setCropArea', {
      detail: {
        x: 112,
        y: 428,
        width: 273,
        height: 169
      }
    });
    window.dispatchEvent(event);
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
    saveWorkbenchState,
    restoreWorkbenchState,
    backToAllTools,
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
