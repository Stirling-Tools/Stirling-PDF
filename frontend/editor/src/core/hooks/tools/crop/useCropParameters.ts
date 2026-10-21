import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";
import { useCallback } from "react";
import {
  Rectangle,
  clampRectToBox,
  roundCropArea,
  isRectangle,
} from "@app/utils/cropCoordinates";
import { DEFAULT_CROP_AREA } from "@app/constants/cropConstants";
import { validatePageNumbers } from "@app/utils/pageSelection";

export interface CropParameters extends BaseParameters {
  cropArea: Rectangle;
  autoCrop: boolean;
  /** Pages to crop, e.g. "3", "1,3,5-8" or "all" */
  pageNumbers: string;
}

export const defaultParameters: CropParameters = {
  cropArea: DEFAULT_CROP_AREA,
  autoCrop: false,
  pageNumbers: "all",
};

/** Page bounds the crop must stay inside, in page user space. */
type PageBox = Rectangle;

export type CropParametersHook = BaseParametersHook<CropParameters> & {
  /** Set crop area, clamped to the page bounds when they are known. */
  setCropArea: (cropArea: Rectangle, pageBox?: PageBox) => void;
  /** Get current crop area */
  getCropArea: () => Rectangle;
  /** Reset to a 10% inset inside the page */
  resetToDefaultCropArea: (pageBox: PageBox) => void;
  /** Reset to full page dimensions */
  resetToFullPDF: (pageBox: PageBox) => void;
  /** Check if current crop area is valid for the page */
  isCropAreaValid: (pageBox?: PageBox) => boolean;
  /** Check if crop area covers the entire page */
  isFullPDFCrop: (pageBox?: PageBox) => boolean;
  /** Update crop area with constraints applied */
  updateCropAreaConstrained: (
    cropArea: Partial<Rectangle>,
    pageBox?: PageBox,
  ) => void;
};

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateCropParameters(params: CropParameters): boolean {
  const rect = params.cropArea;
  // Basic validation - coordinates and dimensions must be positive
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    validatePageNumbers(params.pageNumbers)
  );
}

export const useCropParameters = (): CropParametersHook => {
  const baseHook = useBaseParameters({
    defaultParameters,
    endpointName: "crop",
    validateFn: validateCropParameters,
  });

  const getCropArea = useCallback((): Rectangle => {
    return baseHook.parameters.cropArea;
  }, [baseHook.parameters]);

  const setCropArea = useCallback(
    (cropArea: Rectangle, pageBox?: PageBox) => {
      const rounded = roundCropArea(cropArea);
      baseHook.updateParameter(
        "cropArea",
        pageBox ? clampRectToBox(rounded, pageBox) : rounded,
      );
    },
    [baseHook],
  );

  const resetToDefaultCropArea = useCallback(
    (pageBox: PageBox) => {
      const insetX = pageBox.width * 0.1;
      const insetY = pageBox.height * 0.1;
      setCropArea(
        {
          x: pageBox.x + insetX,
          y: pageBox.y + insetY,
          width: pageBox.width - insetX * 2,
          height: pageBox.height - insetY * 2,
        },
        pageBox,
      );
    },
    [setCropArea],
  );

  const resetToFullPDF = useCallback(
    (pageBox: PageBox) => {
      setCropArea({ ...pageBox }, pageBox);
    },
    [setCropArea],
  );

  const isCropAreaValid = useCallback(
    (pageBox?: PageBox): boolean => {
      const cropArea = getCropArea();
      if (cropArea.width <= 0 || cropArea.height <= 0) return false;
      if (!pageBox) return true;
      return (
        cropArea.x >= pageBox.x - 0.5 &&
        cropArea.y >= pageBox.y - 0.5 &&
        cropArea.x + cropArea.width <= pageBox.x + pageBox.width + 0.5 &&
        cropArea.y + cropArea.height <= pageBox.y + pageBox.height + 0.5
      );
    },
    [getCropArea],
  );

  const isFullPDFCrop = useCallback(
    (pageBox?: PageBox): boolean => {
      if (!pageBox) return false;
      const cropArea = getCropArea();
      const tolerance = 0.5;
      return (
        Math.abs(cropArea.x - pageBox.x) < tolerance &&
        Math.abs(cropArea.y - pageBox.y) < tolerance &&
        Math.abs(cropArea.width - pageBox.width) < tolerance &&
        Math.abs(cropArea.height - pageBox.height) < tolerance
      );
    },
    [getCropArea],
  );

  const updateCropAreaConstrained = useCallback(
    (partial: Partial<Rectangle>, pageBox?: PageBox) => {
      setCropArea({ ...getCropArea(), ...partial }, pageBox);
    },
    [getCropArea, setCropArea],
  );

  // Overrides the base updateParameter so a rectangle can never carry a
  // negative size or coordinate into the request.
  const updateParameter = useCallback(
    <K extends keyof CropParameters>(
      parameter: K,
      value: CropParameters[K],
    ) => {
      if (isRectangle(value)) {
        baseHook.updateParameter(parameter, {
          x: Math.max(0, value.x),
          y: Math.max(0, value.y),
          width: Math.max(0, value.width),
          height: Math.max(0, value.height),
        } as CropParameters[K]);
        return;
      }
      baseHook.updateParameter(parameter, value);
    },
    [baseHook],
  );

  return {
    ...baseHook,
    updateParameter,
    setCropArea,
    getCropArea,
    resetToDefaultCropArea,
    resetToFullPDF,
    isCropAreaValid,
    isFullPDFCrop,
    updateCropAreaConstrained,
  };
};
