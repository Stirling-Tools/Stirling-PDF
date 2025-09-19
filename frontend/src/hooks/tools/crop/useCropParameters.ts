import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';
import { useMemo, useCallback } from 'react';
import { CropArea, PDFBounds, constrainCropAreaToPDF, createFullPDFCropArea, roundCropArea } from '../../../utils/cropCoordinates';

export interface CropParameters extends BaseParameters {
  /** X coordinate of crop area (PDF points, left edge) */
  x: number;
  /** Y coordinate of crop area (PDF points, bottom edge in PDF coordinate system) */
  y: number;
  /** Width of crop area (PDF points) */
  width: number;
  /** Height of crop area (PDF points) */
  height: number;
}

export const defaultParameters: CropParameters = {
  x: 0,
  y: 0,
  width: 595, // Default A4 width in points
  height: 842, // Default A4 height in points
};

export type CropParametersHook = BaseParametersHook<CropParameters> & {
  /** Set crop area with PDF bounds validation */
  setCropArea: (cropArea: CropArea, pdfBounds?: PDFBounds) => void;
  /** Get current crop area as CropArea object */
  getCropArea: () => CropArea;
  /** Reset to full PDF dimensions */
  resetToFullPDF: (pdfBounds: PDFBounds) => void;
  /** Check if current crop area is valid for the PDF */
  isCropAreaValid: (pdfBounds?: PDFBounds) => boolean;
  /** Check if crop area covers the entire PDF */
  isFullPDFCrop: (pdfBounds?: PDFBounds) => boolean;
  /** Update crop area with constraints applied */
  updateCropAreaConstrained: (cropArea: Partial<CropArea>, pdfBounds?: PDFBounds) => void;
};

export const useCropParameters = (): CropParametersHook => {
  const baseHook = useBaseParameters({
    defaultParameters,
    endpointName: 'crop',
    validateFn: (params) => {
      // Basic validation - coordinates and dimensions must be positive
      return params.x >= 0 &&
             params.y >= 0 &&
             params.width > 0 &&
             params.height > 0;
    },
  });

  // Get current crop area as CropArea object
  const getCropArea = useCallback((): CropArea => {
    return {
      x: baseHook.parameters.x,
      y: baseHook.parameters.y,
      width: baseHook.parameters.width,
      height: baseHook.parameters.height,
    };
  }, [baseHook.parameters]);

  // Set crop area with optional PDF bounds validation
  const setCropArea = useCallback((cropArea: CropArea, pdfBounds?: PDFBounds) => {
    let finalCropArea = roundCropArea(cropArea);

    // Apply PDF bounds constraints if provided
    if (pdfBounds) {
      finalCropArea = constrainCropAreaToPDF(finalCropArea, pdfBounds);
    }

    baseHook.updateParameter('x', finalCropArea.x);
    baseHook.updateParameter('y', finalCropArea.y);
    baseHook.updateParameter('width', finalCropArea.width);
    baseHook.updateParameter('height', finalCropArea.height);
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
      return cropArea.x + cropArea.width <= pdfBounds.actualWidth &&
             cropArea.y + cropArea.height <= pdfBounds.actualHeight;
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
    partialCropArea: Partial<CropArea>,
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
    // Ensure numeric parameters are positive
    if (typeof value === 'number' && parameter !== 'x' && parameter !== 'y') {
      value = Math.max(0.1, value) as CropParameters[K]; // Minimum 0.1 point
    } else if (typeof value === 'number') {
      value = Math.max(0, value) as CropParameters[K]; // x,y can be 0
    }

    baseHook.updateParameter(parameter, value);
  }, [baseHook]);

  // Calculate crop area percentage of original PDF
  const getCropPercentage = useCallback((pdfBounds?: PDFBounds): number => {
    if (!pdfBounds) return 100;

    const cropArea = getCropArea();
    const totalArea = pdfBounds.actualWidth * pdfBounds.actualHeight;
    const cropAreaSize = cropArea.width * cropArea.height;

    return (cropAreaSize / totalArea) * 100;
  }, [getCropArea]);

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
