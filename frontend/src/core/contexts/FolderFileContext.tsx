import { createContext, useContext, useState, ReactNode } from 'react';
import { useFolderData } from '@app/hooks/useFolderData';
import { FolderFileMetadata, FolderRecord } from '@app/types/smartFolders';

interface FolderFileContextValue {
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  folderRecord: FolderRecord | null;
  fileIds: string[];
  pendingFileIds: string[];
  processingFileIds: string[];
  processedFileIds: string[];
  addFile: (fileId: string, metadata?: Partial<FolderFileMetadata>) => Promise<void>;
  removeFile: (fileId: string) => Promise<void>;
  updateFileMetadata: (fileId: string, updates: Partial<FolderFileMetadata>) => Promise<void>;
  clearFolder: () => Promise<void>;
  getFileMetadata: (fileId: string) => FolderFileMetadata | null;
  isFileProcessed: (fileId: string) => boolean;
  isFileProcessing: (fileId: string) => boolean;
}

const FolderFileContext = createContext<FolderFileContextValue | null>(null);

interface FolderFileContextProviderProps {
  children: ReactNode;
}

// Inner component so useFolderData is only called once activeFolderId is set
function FolderFileContextInner({
  activeFolderId,
  setActiveFolderId,
  children,
}: {
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  children: ReactNode;
}) {
  const folderData = useFolderData(activeFolderId ?? '');
  return (
    <FolderFileContext.Provider value={{ activeFolderId, setActiveFolderId, ...folderData }}>
      {children}
    </FolderFileContext.Provider>
  );
}

export function FolderFileContextProvider({ children }: FolderFileContextProviderProps) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  return (
    <FolderFileContextInner activeFolderId={activeFolderId} setActiveFolderId={setActiveFolderId}>
      {children}
    </FolderFileContextInner>
  );
}

export function useFolderFileContext(): FolderFileContextValue {
  const ctx = useContext(FolderFileContext);
  if (!ctx) throw new Error('useFolderFileContext must be used within FolderFileContextProvider');
  return ctx;
}
