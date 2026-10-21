import {
  CONVERSION_MATRIX,
  EXTENSION_TO_ENDPOINT,
} from "@app/constants/convertConstants";
import {
  defaultParameters,
  type ConvertParameters,
} from "@app/hooks/tools/convert/useConvertParameters";
import {
  getEndpointName,
  getEndpointUrl,
  isImageFormat,
  isWebFormat,
  usesOfficeEngine,
} from "@app/utils/convertUtils";
import { detectFileExtension } from "@app/utils/fileUtils";

/** Which reusable settings panel the advanced dialog should render. */
export type NonPdfConversionOptionsKind =
  | "image"
  | "svg"
  | "web"
  | "email"
  | "ebook"
  | "cbz"
  | "cbr"
  | "office"
  | "none";

export interface NonPdfConversionPlan {
  extension: string;
  /** Convert tool's source identifier: a known extension, `file-<ext>`, or `any`. */
  fromExtension: string;
  formatLabel: string;
  endpointName: string;
  endpointUrl: string;
  optionsKind: NonPdfConversionOptionsKind;
}

const EBOOK_EXTENSIONS = ["epub", "mobi", "azw3", "fb2"];
const EMAIL_EXTENSIONS = ["eml", "msg"];

function getOptionsKind(extension: string): NonPdfConversionOptionsKind {
  if (extension === "svg") return "svg";
  if (isImageFormat(extension)) return "image";
  if (isWebFormat(extension)) return "web";
  if (EMAIL_EXTENSIONS.includes(extension)) return "email";
  if (EBOOK_EXTENSIONS.includes(extension)) return "ebook";
  if (extension === "cbz") return "cbz";
  if (extension === "cbr") return "cbr";
  if (usesOfficeEngine(extension, "pdf")) return "office";
  return "none";
}

/**
 * Describes how a workspace file reaches PDF. The conversion tool already offers a
 * file-to-pdf fallback for every extension, so unknown types still get a plan; the server
 * reports the real failure if it cannot read the bytes.
 */
export function getNonPdfConversionPlan(
  fileName: string,
): NonPdfConversionPlan {
  const extension = detectFileExtension(fileName);
  const isKnownExtension = extension !== "" && extension in CONVERSION_MATRIX;

  return {
    extension,
    fromExtension: isKnownExtension
      ? extension
      : extension
        ? `file-${extension}`
        : "any",
    formatLabel: extension ? extension.toUpperCase() : "File",
    endpointName: getEndpointName(extension || "any", "pdf"),
    endpointUrl: getEndpointUrl(extension || "any", "pdf"),
    optionsKind: getOptionsKind(extension),
  };
}

function copyDefaults(): ConvertParameters {
  return {
    ...defaultParameters,
    imageOptions: { ...defaultParameters.imageOptions },
    htmlOptions: { ...defaultParameters.htmlOptions },
    emailOptions: { ...defaultParameters.emailOptions },
    pdfaOptions: { ...defaultParameters.pdfaOptions },
    pdfUaOptions: { ...defaultParameters.pdfUaOptions },
    pdfxOptions: { ...defaultParameters.pdfxOptions },
    cbrOptions: { ...defaultParameters.cbrOptions },
    pdfToCbrOptions: { ...defaultParameters.pdfToCbrOptions },
    cbzOptions: { ...defaultParameters.cbzOptions },
    cbzOutputOptions: { ...defaultParameters.cbzOutputOptions },
    ebookOptions: defaultParameters.ebookOptions
      ? { ...defaultParameters.ebookOptions }
      : undefined,
    epubOptions: defaultParameters.epubOptions
      ? { ...defaultParameters.epubOptions }
      : undefined,
  };
}

/** Conversion parameters for opening this file as a PDF, independent of the Convert tool page. */
export function getNonPdfConversionParameters(
  fileName: string,
  plan: NonPdfConversionPlan = getNonPdfConversionPlan(fileName),
): ConvertParameters {
  return {
    ...copyDefaults(),
    fromExtension: plan.fromExtension,
    toExtension: "pdf",
    isSmartDetection: false,
    smartDetectionType: "none",
  };
}

/**
 * Endpoint mapping is the one piece the viewer cannot derive from the tool's current
 * selectors, so expose it for tests and diagnostics.
 */
export function hasExplicitConversion(extension: string): boolean {
  return extension in EXTENSION_TO_ENDPOINT;
}
