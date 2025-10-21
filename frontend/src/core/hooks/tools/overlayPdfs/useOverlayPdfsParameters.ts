import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, type BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export type OverlayMode = 'SequentialOverlay' | 'InterleavedOverlay' | 'FixedRepeatOverlay';

export interface OverlayPdfsParameters extends BaseParameters {
  overlayFiles: File[];
  overlayMode: OverlayMode;
  overlayPosition: 0 | 1;
  counts: number[];
}

export const defaultParameters: OverlayPdfsParameters = {
  overlayFiles: [],
  overlayMode: 'SequentialOverlay',
  overlayPosition: 0,
  counts: []
};

export type OverlayPdfsParametersHook = BaseParametersHook<OverlayPdfsParameters>;

export const useOverlayPdfsParameters = (): OverlayPdfsParametersHook => {
  return useBaseParameters<OverlayPdfsParameters>({
    defaultParameters,
    endpointName: 'overlay-pdfs',
    validateFn: (params) => {
      if (!params.overlayFiles || params.overlayFiles.length === 0) return false;
      if (params.overlayMode === 'FixedRepeatOverlay') {
        if (!params.counts || params.counts.length !== params.overlayFiles.length) return false;
        if (params.counts.some((c) => !Number.isFinite(c) || c <= 0)) return false;
      }
      return true;
    },
  });
};


