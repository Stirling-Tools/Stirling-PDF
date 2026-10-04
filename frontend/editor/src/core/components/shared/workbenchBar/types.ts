import type { IconName } from "@app/ui/Icon";
import { WorkbenchType } from "@app/types/workbench";

/** Shared shape for the workbench bar's file-level global actions (print,
 *  export, save-as, close) so the mobile and desktop clusters stay in step. */
export interface WorkbenchBarActionsProps {
  currentView: WorkbenchType;
  /** Custom workbench views own their content, so file actions don't apply. */
  /** Whether the view has a document for the file-level actions to act on: a custom
   *  view brings its own canvas, and the library lists files rather than opening one. */
  showsFileActions: boolean;
  /** No files to act on, or the bar is globally locked out. */
  actionsDisabled: boolean;
  /** A policy run is enforcing on a file the export would touch. */
  policyEnforcing: boolean;
  /** Context-aware label for the download/export action. */
  downloadLabel: string;
  downloadIconName: IconName;
  saveAsIconName?: IconName;
  onPrint: () => void;
  onExport: (forceNewFile?: boolean) => void;
  onClose: () => void;
}
