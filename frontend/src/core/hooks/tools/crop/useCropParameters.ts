import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import { useCallback } from 'react';
import { Rectangle, PDFBounds, constrainCropAreaToPDF, createFullPDFCropArea, roundCropArea, isRectangle } from '@app/utils/cropCoordinates';
import { DEFAULT_CROP_AREA } from '@app/constants/cropConstants';

export interface CropParameters extends BaseParameters {
  cropArea: Rectangle;
  autoCrop: boolean;
}

export const defaultParameters: CropParameters = {
  cropArea: DEFAULT_CROP_AREA,
  autoCrop: false,
};

export type CropParametersHook = BaseParametersHook<CropParameters> & {
  /** Set crop area with PDF bounds validation */
  setCropArea: (cropArea: Rectangle, pdfBounds?: PDFBounds) => void;
  /** Get current crop area as CropArea object */
  getCropArea: () => Rectangle;
  /** Reset to full PDF dimensions */
  resetToFullPDF: (pdfBounds: PDFBounds) => void;
  /** Check if current crop area is valid for the PDF */
  isCropAreaValid: (pdfBounds?: PDFBounds) => boolean;
  /** Check if crop area covers the entire PDF */
  isFullPDFCrop: (pdfBounds?: PDFBounds) => boolean;
  /** Update crop area with constraints applied */
  updateCropAreaConstrained: (cropArea: Partial<Rectangle>, pdfBounds?: PDFBounds) => void;
};

export const useCropParameters = (): CropParametersHook => {
  const baseHook = useBaseParameters({
    defaultParameters,
    endpointName: 'crop',
    validateFn: (params) => {
      const rect = params.cropArea;
      // Basic validation - coordinates and dimensions must be positive
      return rect.x >= 0 &&
             rect.y >= 0 &&
             rect.width > 0 &&
             rect.height > 0;
    },
  });

  // Get current crop area as CropArea object
  const getCropArea = useCallback((): Rectangle => {
    return baseHook.parameters.cropArea;
  }, [baseHook.parameters]);

  // Set crop area with optional PDF bounds validation
  const setCropArea = useCallback((cropArea: Rectangle, pdfBounds?: PDFBounds) => {
    let finalCropArea = roundCropArea(cropArea);

    // Apply PDF bounds constraints if provided
    if (pdfBounds) {
      finalCropArea = constrainCropAreaToPDF(finalCropArea, pdfBounds);
    }
    baseHook.updateParameter('cropArea', finalCropArea);
  }, [baseHook]);

  // Reset to cover entire PDF
  const resetToFullPDF = useCallback((pdfBounds: PDFBounds) => {
    const fullCropArea = createFullPDFCropArea(pdfBounds);
    setCropArea(fullCropArea);
  }, [setCropArea]);

  // Check if current crop area is valid for the given PDF bounds
  const isCropAreaValid = useCallback((pdfBounds?: PDFBounds): boolean => {
    const cropArea = getCropArea();

    // Basic validation
    if (cropArea.x < 0 || cropArea.y < 0 || cropArea.width <= 0 || cropArea.height <= 0) {
      return false;
    }

    // PDF bounds validation if provided
    if (pdfBounds) {
      const tolerance = 0.01; // Small tolerance for floating point precision
      return cropArea.x + cropArea.width <= pdfBounds.actualWidth + tolerance &&
             cropArea.y + cropArea.height <= pdfBounds.actualHeight + tolerance;
    }

    return true;
  }, [getCropArea]);

  // Check if crop area covers the entire PDF
  const isFullPDFCrop = useCallback((pdfBounds?: PDFBounds): boolean => {
    if (!pdfBounds) return false;

    const cropArea = getCropArea();
    const tolerance = 0.5; // Allow 0.5 point tolerance for floating point precision

    return Math.abs(cropArea.x) < tolerance &&
           Math.abs(cropArea.y) < tolerance &&
           Math.abs(cropArea.width - pdfBounds.actualWidth) < tolerance &&
           Math.abs(cropArea.height - pdfBounds.actualHeight) < tolerance;
  }, [getCropArea]);

  // Update crop area with constraints applied
  const updateCropAreaConstrained = useCallback((
    partialCropArea: Partial<Rectangle>,
    pdfBounds?: PDFBounds
  ) => {
    const currentCropArea = getCropArea();
    const newCropArea = { ...currentCropArea, ...partialCropArea };
    setCropArea(newCropArea, pdfBounds);
  }, [getCropArea, setCropArea]);

  // Enhanced validation that considers PDF bounds
  const validateParameters = useCallback((pdfBounds?: PDFBounds): boolean => {
    return baseHook.validateParameters() && isCropAreaValid(pdfBounds);
  }, [baseHook, isCropAreaValid]);

  // Override updateParameter to ensure positive values
  const updateParameter = useCallback(<K extends keyof CropParameters>(
    parameter: K,
    value: CropParameters[K]
  ) => {

    if(isRectangle(value)) {
      value.x = Math.max(0.1, value.x); // Minimum 0.1 point
      value.x = Math.max(0.1, value.y); // Minimum 0.1 point
      value.width = Math.max(0, value.width); // Minimum 0 point
      value.height = Math.max(0, value.height); // Minimum 0 point
    }

    baseHook.updateParameter(parameter, value);
  }, [baseHook]);


  return {
    ...baseHook,
    updateParameter,
    validateParameters: () => validateParameters(),
    setCropArea,
    getCropArea,
    resetToFullPDF,
    isCropAreaValid,
    isFullPDFCrop,
    updateCropAreaConstrained,
  };
};
