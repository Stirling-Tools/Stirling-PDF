import { StirlingFileStub } from "@editor/types/fileContext";
import {
  TargetStatusDot,
  type TargetStatus,
} from "@editor/components/fileEditor/TargetStatusDot";

interface FileEditorStatusDotProps {
  file: StirlingFileStub;
  /** Set when Save sends this file to a save target. */
  target?: TargetStatus;
}

export function FileEditorStatusDot({ target }: FileEditorStatusDotProps) {
  // Web files have no disk copy, so only a save target's state shows.
  return target?.unsaved ? <TargetStatusDot {...target} /> : null;
}
