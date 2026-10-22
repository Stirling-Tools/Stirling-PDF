import { useMemo, type ReactNode } from "react";
import {
  useWorkbenchBarButtons,
  type WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";

export interface FileLibraryWorkbenchBarButtonsOptions {
  /** Names the folder being shown. Null where the library places it itself. */
  path: ReactNode;
  /** The library's own actions. Null where the library places them itself. */
  actions: ReactNode;
}

/**
 * Puts the library's chrome in the bar every other view uses, for the layouts with
 * nowhere else to put it. Rendered whole rather than as icons and handlers: which
 * controls appear, and the menus behind them, are the library's business.
 */
export function useFileLibraryWorkbenchBarButtons({
  path,
  actions,
}: FileLibraryWorkbenchBarButtonsOptions): void {
  const buttons = useMemo<WorkbenchBarButtonWithAction[]>(
    () => [
      ...(path
        ? [
            {
              id: "fileLibraryPath",
              section: "bar-lead" as const,
              order: 10,
              render: () => path,
            },
          ]
        : []),
      ...(actions
        ? [
            {
              id: "fileLibraryActions",
              section: "bar" as const,
              order: 20,
              render: () => actions,
            },
          ]
        : []),
    ],
    [path, actions],
  );

  useWorkbenchBarButtons(buttons);
}
