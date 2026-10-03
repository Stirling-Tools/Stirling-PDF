import React from "react";
import type { FileId } from "@app/types/file";

/** "bar-lead" follows the view switcher, for content naming what the view is showing;
 *  "bar" renders among the bar's own actions on the right; top/middle/bottom are lanes
 *  of the retractable tool row beneath it. */
export type WorkbenchBarSection =
  | "bar-lead"
  | "bar"
  | "top"
  | "middle"
  | "bottom"
  | "tool-panel";

export type WorkbenchBarAction = () => void;

export interface WorkbenchBarRenderContext {
  id: string;
  disabled: boolean;
  allButtonsDisabled: boolean;
  action?: WorkbenchBarAction;
  triggerAction: () => void;
  active: boolean;
}

export interface WorkbenchBarButtonConfig {
  /** Unique id for the button, also used to bind action callbacks */
  id: string;
  /** Icon element to render when using default renderer */
  icon?: React.ReactNode;
  /** Tooltip content (can be localized node) */
  tooltip?: React.ReactNode;
  /** Optional ARIA label for a11y (separate from visual tooltip) */
  ariaLabel?: string;
  /** Optional i18n key carried by config */
  templateKey?: string;
  /** Visual grouping lane */
  section?: WorkbenchBarSection;
  /** Sorting within a section (lower first); ties broken by id */
  order?: number;
  /** Initial disabled state */
  disabled?: boolean;
  /** Initial visibility */
  visible?: boolean;
  /** Optional custom renderer for advanced layouts */
  render?: (ctx: WorkbenchBarRenderContext) => React.ReactNode;
  /** Optional className applied to wrapper when using default renderer */
  className?: string;
  /** Optional active state to highlight the control */
  active?: boolean;
}

/** One file the bar's download writes out. */
export interface WorkbenchExportFile {
  file: File;
  /** The workbench record these bytes are, if any: lets the download save back
   *  to its disk location and lets export policies version it. Omit for bytes
   *  the workbench does not hold, such as unsaved edits. */
  fileId?: FileId;
}

/**
 * Stands in for the bar's file-level download and close while a view that owns
 * what it shows is open. Each is optional; the bar's default runs for the rest.
 */
export interface WorkbenchViewFileActions {
  /** The files to download in place of the open ones, or null to cancel. */
  getExportFiles?: () => Promise<WorkbenchExportFile[] | null>;
  onClose?: () => void;
}
