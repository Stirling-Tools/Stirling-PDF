import type { IconName } from "@editor/ui/Icon";
import { WorkbenchType } from "@editor/types/workbench";
import type { SaveMenuItem } from "@editor/services/saveTargets";

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
  /** Changes not yet saved to where Save goes. */
  downloadUnsaved?: boolean;
  /** Other save destinations; replaces the Save As button when set. */
  saveMenu?: SaveMenuItem[];
  onPrint?: () => void;
  printDisabledReason?: string;
  onExport: (forceNewFile?: boolean) => void;
  onClose: () => void;
}
