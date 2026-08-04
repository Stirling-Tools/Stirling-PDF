import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface WorkspaceFile {
  id: string;
  name: string;
  file: File;
  url: string;
  lastModified: number;
  isActive: boolean;
}

interface WorkspaceContextType {
  files: WorkspaceFile[];
  activeFileId: string | null;
  addFile: (file: File) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  reorderFiles: (startIndex: number, endIndex: number) => void;
  updateFileName: (id: string, newName: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  const addFile = useCallback((file: File) => {
    const newFile: WorkspaceFile = {
      id: uuidv4(),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      lastModified: Date.now(),
      isActive: true,
    };

    setFiles((prev) => {
      // Deactivate all existing files
      const deactivated = prev.map(f => ({ ...f, isActive: false }));
      return [...deactivated, newFile];
    });
    setActiveFileId(newFile.id);
  }, []);

  const closeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const fileToClose = prev.find(f => f.id === id);
      if (fileToClose) {
        URL.revokeObjectURL(fileToClose.url);
      }
      
      const newFiles = prev.filter(f => f.id !== id);
      
      // If we closed the active file, activate the last remaining one
      if (id === activeFileId && newFiles.length > 0) {
        setActiveFileId(newFiles[newFiles.length - 1].id);
        // Update isActive flag in the new list
        return newFiles.map((f, index) => ({
          ...f,
          isActive: index === newFiles.length - 1
        }));
      }
      
      return newFiles;
    });

    if (files.length === 1) {
      setActiveFileId(null);
    }
  }, [activeFileId, files.length]);

  const setActiveFile = useCallback((id: string) => {
    setActiveFileId(id);
    setFiles(prev => prev.map(f => ({
      ...f,
      isActive: f.id === id
    })));
  }, []);

  const reorderFiles = useCallback((startIndex: number, endIndex: number) => {
    setFiles((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  const updateFileName = useCallback((id: string, newName: string) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, name: newName } : f
    ));
  }, []);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach(f => URL.revokeObjectURL(f.url));
    };
  }, [files]);

  return (
    <WorkspaceContext.Provider value={{ 
      files, 
      activeFileId, 
      addFile, 
      closeFile, 
      setActiveFile, 
      reorderFiles,
      updateFileName
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
