import { createContext, useContext, type ReactNode } from "react";

export interface FileMenuValue {
  /** Collapsed to no width at all, so the panel's own toggle went with it. */
  hidden: boolean;
  expand: () => void;
}

const FileMenuContext = createContext<FileMenuValue | null>(null);

/**
 * Lets the workbench bar host the file menu's toggle while the menu is hidden.
 * The page owns the collapsed state; the bar only needs to know it is hidden
 * and how to bring it back.
 */
export function FileMenuProvider({
  value,
  children,
}: {
  value: FileMenuValue;
  children: ReactNode;
}) {
  return (
    <FileMenuContext.Provider value={value}>
      {children}
    </FileMenuContext.Provider>
  );
}

/** Null on surfaces with no file menu, which render no toggle. */
export function useFileMenu(): FileMenuValue | null {
  return useContext(FileMenuContext);
}
