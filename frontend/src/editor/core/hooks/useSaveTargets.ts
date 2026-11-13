import { useMemo } from "react";
import { useOneDriveSave } from "@editor/hooks/useOneDriveSave";
import type { SaveTarget } from "@editor/services/saveTargets";

const NONE: SaveTarget[] = [];

/** Places Save can write back to besides disk and downloads. */
export function useSaveTargets(): SaveTarget[] {
  const { target } = useOneDriveSave();
  return useMemo(() => (target ? [target] : NONE), [target]);
}
