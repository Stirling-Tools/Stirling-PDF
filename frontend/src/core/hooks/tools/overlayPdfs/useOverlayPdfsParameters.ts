import { useCallback } from "react";
import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  type BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export type OverlayMode =
  | "SequentialOverlay"
  | "InterleavedOverlay"
  | "FixedRepeatOverlay";

export interface OverlayPdfsParameters extends BaseParameters {
  overlayFiles: File[];
  overlayMode: OverlayMode;
  overlayPosition: 0 | 1;
  counts: number[];
}

export const defaultParameters: OverlayPdfsParameters = {
  overlayFiles: [],
  overlayMode: "SequentialOverlay",
  overlayPosition: 0,
  counts: [],
};

export type OverlayPdfsParametersHook =
  BaseParametersHook<OverlayPdfsParameters>;

export const useOverlayPdfsParameters = (): OverlayPdfsParametersHook => {
  const base = useBaseParameters<OverlayPdfsParameters>({
    defaultParameters,
    endpointName: "overlay-pdfs",
    validateFn: (params) => {
      if (!params.overlayFiles || params.overlayFiles.length === 0)
        return false;
      if (params.overlayMode === "FixedRepeatOverlay") {
        if (
          !params.counts ||
          params.counts.length !== params.overlayFiles.length
        )
          return false;
        if (params.counts.some((c) => !Number.isFinite(c) || c <= 0))
          return false;
      }
      return true;
    },
  });

  // Overlay files are chosen independently of the base file selection, so they
  // must survive the parameter reset that fires when the workbench selection
  // transitions from 0 → 1+ files. Only mode/position/counts are reset.
  const resetParameters = useCallback(() => {
    base.setParameters((prev) => ({
      ...defaultParameters,
      overlayFiles: prev.overlayFiles,
    }));
  }, [base.setParameters]);

  return { ...base, resetParameters };
};
