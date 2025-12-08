/**
 * React contexts for file state and actions
 */

import { createContext } from 'react';
import { FileContextStateValue, FileContextActionsValue } from '@app/types/fileContext';

// Split contexts for performance
export const FileStateContext = createContext<FileContextStateValue | undefined>(undefined);
export const FileActionsContext = createContext<FileContextActionsValue | undefined>(undefined);

// Export types for use in hooks
export type { FileContextStateValue, FileContextActionsValue };