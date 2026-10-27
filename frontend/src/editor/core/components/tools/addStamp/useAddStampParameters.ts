import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  type BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface AddStampParameters extends BaseParameters {
  stampType?: "text" | "image" | "qr";
  stampText: string;
  stampImage?: File;
  alphabet: "roman" | "arabic" | "japanese" | "korean" | "chinese" | "thai";
  fontSize: number;
  rotation: number;
  opacity: number;
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  overrideX: number;
  overrideY: number;
  customMargin: "small" | "medium" | "large" | "x-large";
  customColor: string;
  pageNumbers: string;
  _activePill: "fontSize" | "rotation" | "opacity";
}

/**
 * Must stay in sync with StampController.MAX_QR_CONTENT_BYTES, and below the 2331 bytes a
 * level-M QR code holds: the preview's QRCodeSVG throws during render past that.
 */
export const MAX_QR_CONTENT_BYTES = 1000;

/** Size in points to switch to for QR stamps: text-sized codes are too dense to scan. */
export const DEFAULT_QR_SIZE = 120;

const utf8Encoder = new TextEncoder();

export const isQrContentWithinLimit = (content: string): boolean =>
  utf8Encoder.encode(content).length <= MAX_QR_CONTENT_BYTES;

export const defaultParameters: AddStampParameters = {
  stampType: "text",
  stampText: "",
  alphabet: "roman",
  fontSize: 40,
  rotation: 0,
  opacity: 50,
  position: 5,
  overrideX: -1,
  overrideY: -1,
  customMargin: "medium",
  customColor: "#d3d3d3",
  pageNumbers: "1",
  _activePill: "fontSize",
};

export type AddStampParametersHook = BaseParametersHook<AddStampParameters>;

export function validateAddStampParameters(
  params: AddStampParameters,
): boolean {
  if (!params.stampType) return false;
  if (params.stampType === "text") {
    return params.stampText.trim().length > 0;
  }
  if (params.stampType === "qr") {
    return (
      params.stampText.trim().length > 0 &&
      isQrContentWithinLimit(params.stampText)
    );
  }
  return params.stampImage !== undefined;
}

export const useAddStampParameters = (): AddStampParametersHook => {
  return useBaseParameters<AddStampParameters>({
    defaultParameters,
    endpointName: "add-stamp",
    validateFn: validateAddStampParameters,
  });
};
