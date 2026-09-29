/**
 * React contexts for file state and actions
 */

import { createContext } from "react";
import {
  FileContextState,
  FileContextSelectors,
  FileContextStateValue,
  FileContextActionsValue,
} from "@app/types/fileContext";

/**
 * Subscription store for file state. The context VALUE is stable — consumers
 * subscribe and select slices (see useFileSelector), re-rendering only when
 * their selected slice changes, instead of on every state change.
 */
export interface FileStateStore {
  getState: () => FileContextState;
  subscribe: (listener: () => void) => () => void;
  /** Stable selector API (reads live state via refs). */
  selectors: FileContextSelectors;
}

export const FileStoreContext = createContext<FileStateStore | undefined>(
  undefined,
);

export const FileActionsContext = createContext<
  FileContextActionsValue | undefined
>(undefined);

// Export types for use in hooks
export type { FileContextStateValue, FileContextActionsValue };
