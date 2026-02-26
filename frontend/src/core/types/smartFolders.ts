/**
 * Types for Smart Folders functionality
 */

export interface SmartFolder {
  id: string;
  name: string;
  description: string;
  automationId: string; // FK → AutomationConfig.id
  icon: string; // icon name string
  accentColor: string; // hex e.g. '#3b82f6'
  createdAt: string;
  updatedAt: string;
  order?: number;
  isDefault?: boolean;
}

export interface FolderFileMetadata {
  addedAt: Date;
  status: 'pending' | 'processing' | 'processed' | 'error';
  processedAt?: Date;
  displayFileId?: string; // output file id
  inputFileId?: string;
  errorMessage?: string;
}

export interface FolderRecord {
  folderId: string;
  files: Record<string, FolderFileMetadata>;
  lastUpdated: number;
}

export interface SmartFolderRunEntry {
  inputFileId: string;
  displayFileId: string;
  status: 'processing' | 'processed';
}
