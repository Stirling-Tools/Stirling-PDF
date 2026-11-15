import type { SaveTarget } from "@editor/services/saveTargets";

const NONE: SaveTarget[] = [];

/** Places Save can write back to besides disk and downloads. */
export function useSaveTargets(): SaveTarget[] {
  return NONE;
}
