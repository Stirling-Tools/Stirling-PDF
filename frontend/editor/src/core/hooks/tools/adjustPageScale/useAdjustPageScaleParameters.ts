import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export enum PageSize {
  KEEP = "KEEP",
  A0 = "A0",
  A1 = "A1",
  A2 = "A2",
  A3 = "A3",
  A4 = "A4",
  A5 = "A5",
  A6 = "A6",
  LETTER = "LETTER",
  LEGAL = "LEGAL",
  CUSTOM = "CUSTOM",
}

export type Orientation = "PORTRAIT" | "LANDSCAPE";

export type CustomSizeUnit = "mm" | "cm" | "in";

export interface AdjustPageScaleParameters extends BaseParameters {
  scaleFactor: number;
  pageSize: PageSize;
  orientation: Orientation;
  customWidth: number;
  customHeight: number;
  customUnit: CustomSizeUnit;
}

export const defaultParameters: AdjustPageScaleParameters = {
  scaleFactor: 1.0,
  pageSize: PageSize.KEEP,
  orientation: "PORTRAIT",
  customWidth: 210,
  customHeight: 297,
  customUnit: "mm",
};

export type AdjustPageScaleParametersHook =
  BaseParametersHook<AdjustPageScaleParameters>;

const UNITS_PER_INCH: Record<CustomSizeUnit, number> = {
  mm: 25.4,
  cm: 2.54,
  in: 1,
};

// Must match ScalePagesController: ISO 32000-1 Annex C bounds a page side to
// 3..14,400 points.
const MIN_CUSTOM_SIDE_INCHES = 3 / 72;
const MAX_CUSTOM_SIDE_INCHES = 200;

const roundToHundredths = (value: number) => Math.round(value * 100) / 100;

/** Smallest and largest side length the backend accepts, in `unit`, rounded inwards
 * to the two decimals the inputs allow. */
export function customSideLimits(unit: CustomSizeUnit): {
  min: number;
  max: number;
} {
  const unitsPerInch = UNITS_PER_INCH[unit];
  return {
    min: Math.ceil(MIN_CUSTOM_SIDE_INCHES * unitsPerInch * 100) / 100,
    max: Math.floor(MAX_CUSTOM_SIDE_INCHES * unitsPerInch * 100) / 100,
  };
}

/** Re-expresses a side length in another unit, so switching units keeps the page the
 * same physical size. Clamped to the target unit's limits, because rounding to two
 * decimals can step just outside them; a non-positive length is returned unchanged
 * so it still fails validation. */
export function convertCustomSide(
  value: number,
  from: CustomSizeUnit,
  to: CustomSizeUnit,
): number {
  if (!(value > 0)) return value;
  const { min, max } = customSideLimits(to);
  const converted = roundToHundredths(
    (value * UNITS_PER_INCH[to]) / UNITS_PER_INCH[from],
  );
  return Math.min(Math.max(converted, min), max);
}

function isCustomSideInRange(value: number, unit: CustomSizeUnit): boolean {
  const { min, max } = customSideLimits(unit);
  return value >= min && value <= max;
}

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateAdjustPageScaleParameters(
  params: AdjustPageScaleParameters,
): boolean {
  if (params.pageSize === PageSize.CUSTOM) {
    return (
      params.scaleFactor > 0 &&
      isCustomSideInRange(params.customWidth, params.customUnit) &&
      isCustomSideInRange(params.customHeight, params.customUnit)
    );
  }
  return params.scaleFactor > 0;
}

export const useAdjustPageScaleParameters =
  (): AdjustPageScaleParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "scale-pages",
      validateFn: validateAdjustPageScaleParameters,
    });
  };
