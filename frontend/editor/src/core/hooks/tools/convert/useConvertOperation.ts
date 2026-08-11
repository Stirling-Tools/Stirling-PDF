import { useCallback, useMemo } from "react";
import apiClient from "@app/services/apiClient";
import { useTranslation } from "react-i18next";
import {
  validateConvertParameters,
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";
import { createFileFromApiResponse } from "@app/utils/fileResponseUtils";
import {
  useToolOperation,
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  getEndpointUrl,
  getEndpointName,
  isImageFormat,
  isWebFormat,
  isOfficeFormat,
} from "@app/utils/convertUtils";
import {
  isToolEndpoint,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import {
  CONVERSION_ENDPOINTS,
  COLOR_TYPES,
  OUTPUT_OPTIONS,
  FIT_OPTIONS,
} from "@app/constants/convertConstants";
import { useToolCloudStatus } from "@app/hooks/useToolCloudStatus";

// Static function that can be used by both the hook and automation executor
export const shouldProcessFilesSeparately = (
  selectedFiles: File[],
  parameters: ConvertParameters,
): boolean => {
  return (
    selectedFiles.length > 1 &&
    // Image to PDF with combineImages = false
    (((isImageFormat(parameters.fromExtension) ||
      parameters.fromExtension === "image") &&
      parameters.toExtension === "pdf" &&
      !parameters.imageOptions.combineImages) ||
      // SVG to PDF with combineIntoSinglePdf = false
      (parameters.fromExtension === "svg" &&
        parameters.toExtension === "pdf" &&
        !parameters.imageOptions.combineImages) ||
      // PDF to image conversions (each PDF should generate its own image file)
      (parameters.fromExtension === "pdf" &&
        isImageFormat(parameters.toExtension)) ||
      // PDF to PDF/A and PDF/X conversions (each PDF should be processed separately)
      (parameters.fromExtension === "pdf" &&
        (parameters.toExtension === "pdfa" ||
          parameters.toExtension === "pdfx")) ||
      // PDF to text-like/spreadsheet formats should be one output per input
      (parameters.fromExtension === "pdf" &&
        ["txt", "rtf", "csv", "xlsx"].includes(parameters.toExtension)) ||
      // PDF to CBR conversions (each PDF should generate its own archive)
      (parameters.fromExtension === "pdf" &&
        parameters.toExtension === "cbr") ||
      // PDF to EPUB/AZW3 conversions (each PDF should generate its own ebook)
      (parameters.fromExtension === "pdf" &&
        ["epub", "azw3"].includes(parameters.toExtension)) ||
      // PDF to office format conversions (each PDF should generate its own office file)
      (parameters.fromExtension === "pdf" &&
        isOfficeFormat(parameters.toExtension)) ||
      // Office files to PDF conversions (each file should be processed separately via LibreOffice)
      (isOfficeFormat(parameters.fromExtension) &&
        parameters.toExtension === "pdf") ||
      // Web files to PDF conversions (each web file should generate its own PDF)
      ((isWebFormat(parameters.fromExtension) ||
        parameters.fromExtension === "web") &&
        parameters.toExtension === "pdf") ||
      // eBook files to PDF conversions (each file should be processed separately via Calibre)
      (["epub", "mobi", "azw3", "fb2"].includes(parameters.fromExtension) &&
        parameters.toExtension === "pdf") ||
      // Web files smart detection
      (parameters.isSmartDetection &&
        parameters.smartDetectionType === "web") ||
      // Mixed file types (smart detection)
      (parameters.isSmartDetection &&
        parameters.smartDetectionType === "mixed"))
  );
};

// Static function that can be used by both the hook and automation executor
export const buildConvertFormData = (
  parameters: ConvertParameters,
  selectedFiles: File[],
): FormData => {
  const formData = new FormData();
  const {
    fromExtension,
    toExtension,
    imageOptions,
    htmlOptions,
    emailOptions,
    pdfaOptions,
    pdfxOptions,
    cbrOptions,
    pdfToCbrOptions,
    cbzOptions,
    cbzOutputOptions,
    ebookOptions,
    epubOptions,
  } = parameters;

  selectedFiles.forEach((file) => {
    formData.append("fileInput", file);
  });

  if (isImageFormat(toExtension)) {
    formData.append("imageFormat", toExtension);
    formData.append("colorType", imageOptions.colorType);
    formData.append("dpi", imageOptions.dpi.toString());
    formData.append("singleOrMultiple", imageOptions.singleOrMultiple);
  } else if (fromExtension === "pdf" && ["docx", "odt"].includes(toExtension)) {
    formData.append("outputFormat", toExtension);
  } else if (fromExtension === "pdf" && ["pptx", "odp"].includes(toExtension)) {
    formData.append("outputFormat", toExtension);
  } else if (fromExtension === "pdf" && ["txt", "rtf"].includes(toExtension)) {
    formData.append("outputFormat", toExtension);
  } else if (
    (isImageFormat(fromExtension) || fromExtension === "image") &&
    toExtension === "pdf"
  ) {
    formData.append("fitOption", imageOptions.fitOption);
    formData.append("colorType", imageOptions.colorType);
    formData.append("autoRotate", imageOptions.autoRotate.toString());
  } else if (fromExtension === "svg" && toExtension === "pdf") {
    formData.append(
      "combineIntoSinglePdf",
      imageOptions.combineImages.toString(),
    );
  } else if (
    (fromExtension === "html" || fromExtension === "zip") &&
    toExtension === "pdf"
  ) {
    formData.append("zoom", htmlOptions.zoomLevel.toString());
  } else if (
    (fromExtension === "eml" || fromExtension === "msg") &&
    toExtension === "pdf"
  ) {
    formData.append(
      "includeAttachments",
      emailOptions.includeAttachments.toString(),
    );
    formData.append(
      "maxAttachmentSizeMB",
      emailOptions.maxAttachmentSizeMB.toString(),
    );
    formData.append("downloadHtml", emailOptions.downloadHtml.toString());
    formData.append(
      "includeAllRecipients",
      emailOptions.includeAllRecipients.toString(),
    );
  } else if (fromExtension === "pdf" && toExtension === "pdfa") {
    formData.append("outputFormat", pdfaOptions.outputFormat);
    formData.append("strict", String(!!pdfaOptions.strict));
  } else if (fromExtension === "pdf" && toExtension === "pdfx") {
    // Use PDF/A endpoint with PDF/X format parameter
    formData.append("outputFormat", pdfxOptions?.outputFormat || "pdfx");
  } else if (fromExtension === "pdf" && toExtension === "csv") {
    formData.append("pageNumbers", "all");
  } else if (fromExtension === "pdf" && toExtension === "xlsx") {
    formData.append("pageNumbers", "all");
  } else if (fromExtension === "cbr" && toExtension === "pdf") {
    formData.append("optimizeForEbook", cbrOptions.optimizeForEbook.toString());
  } else if (fromExtension === "pdf" && toExtension === "cbr") {
    formData.append("dpi", pdfToCbrOptions.dpi.toString());
  } else if (fromExtension === "cbz" && toExtension === "pdf") {
    formData.append(
      "optimizeForEbook",
      (cbzOptions?.optimizeForEbook ?? false).toString(),
    );
  } else if (fromExtension === "pdf" && toExtension === "cbz") {
    formData.append("dpi", (cbzOutputOptions?.dpi ?? 150).toString());
  } else if (
    ["epub", "mobi", "azw3", "fb2"].includes(fromExtension) &&
    toExtension === "pdf"
  ) {
    formData.append(
      "embedAllFonts",
      (ebookOptions?.embedAllFonts ?? false).toString(),
    );
    formData.append(
      "includeTableOfContents",
      (ebookOptions?.includeTableOfContents ?? false).toString(),
    );
    formData.append(
      "includePageNumbers",
      (ebookOptions?.includePageNumbers ?? false).toString(),
    );
    formData.append(
      "optimizeForEbook",
      (ebookOptions?.optimizeForEbook ?? false).toString(),
    );
  } else if (
    fromExtension === "pdf" &&
    ["epub", "azw3"].includes(toExtension)
  ) {
    formData.append(
      "detectChapters",
      (epubOptions?.detectChapters ?? true).toString(),
    );
    formData.append(
      "targetDevice",
      epubOptions?.targetDevice ?? "TABLET_PHONE_IMAGES",
    );
    formData.append(
      "outputFormat",
      epubOptions?.outputFormat ?? (toExtension === "azw3" ? "AZW3" : "EPUB"),
    );
  }

  return formData;
};

// Static function that can be used by both the hook and automation executor
export const createFileFromResponse = (
  responseData: Blob,
  headers: Record<string, unknown>,
  originalFileName: string,
  targetExtension: string,
): File => {
  const originalName = originalFileName.split(".")[0];

  // Map both pdfa and pdfx to pdf since they both result in PDF files
  if (targetExtension == "pdfa" || targetExtension == "pdfx") {
    targetExtension = "pdf";
  }

  const fallbackFilename = `${originalName}.${targetExtension}`;

  return createFileFromApiResponse(responseData, headers, fallbackFilename);
};

// Static processor that can be used by both the hook and automation executor
export const convertProcessor = async (
  parameters: ConvertParameters,
  selectedFiles: File[],
): Promise<CustomProcessorResult> => {
  const processedFiles: File[] = [];

  // Map PDF/X to use PDF/A endpoint
  const actualToExtension =
    parameters.toExtension === "pdfx" ? "pdfa" : parameters.toExtension;
  const endpoint = getEndpointUrl(parameters.fromExtension, actualToExtension);

  if (!endpoint) {
    throw new Error("Unsupported conversion format");
  }

  // Convert-specific routing logic: decide batch vs individual processing
  // For PDF/X, we want to treat it similar to PDF/A (separate processing)
  const isSeparateProcessing = shouldProcessFilesSeparately(selectedFiles, {
    ...parameters,
    toExtension: actualToExtension, // Use the mapped extension for decision logic
  });

  if (isSeparateProcessing) {
    // Individual processing for complex cases (PDF→image, smart detection, etc.)
    for (const file of selectedFiles) {
      try {
        const formData = buildConvertFormData(parameters, [file]);
        const response = await apiClient.post(endpoint, formData, {
          responseType: "blob",
        });

        const convertedFile = createFileFromResponse(
          response.data,
          response.headers,
          file.name,
          actualToExtension === "pdfa" ? "pdfx" : parameters.toExtension,
        );

        processedFiles.push(convertedFile);
      } catch (error) {
        console.warn(`Failed to convert file ${file.name}:`, error);
      }
    }
  } else {
    // Batch processing for simple cases (image→PDF combine)
    const formData = buildConvertFormData(parameters, selectedFiles);
    const response = await apiClient.post(endpoint, formData, {
      responseType: "blob",
    });

    const baseFilename =
      selectedFiles.length === 1 ? selectedFiles[0].name : "converted_files";

    const convertedFile = createFileFromResponse(
      response.data,
      response.headers,
      baseFilename,
      actualToExtension === "pdfa" ? "pdfx" : parameters.toExtension,
    );
    processedFiles.push(convertedFile);
  }

  // When batch processing multiple files into one output (e.g., 3 images → 1 PDF),
  // mark all inputs as consumed even though there's only 1 output file
  const isCombiningMultiple = !isSeparateProcessing && selectedFiles.length > 1;

  return {
    files: processedFiles,
    consumedAllInputs: isCombiningMultiple,
  };
};

// Every backend endpoint the Convert tool may resolve to. Declaring the full set lets a stored
// convert step map back to this tool by endpoint membership (its from/to selectors are
// frontend-only, recovered from the step's bookkeeping params on deserialize).
export const CONVERT_AUTOMATION_ENDPOINTS: readonly ToolEndpoint[] = Array.from(
  new Set(Object.values(CONVERSION_ENDPOINTS)),
).filter(isToolEndpoint);

/**
 * The backend endpoint a conversion targets (PDF/X shares the PDF/A endpoint). Undefined until both
 * formats are chosen, or when the pair maps to no known endpoint. The single place the from/to ->
 * endpoint mapping lives, shared by the tool config's `endpoint` and the deserialize reader below.
 */
export const convertEndpointFor = (
  fromExtension: string,
  toExtension: string,
): ToolEndpoint | undefined => {
  if (!fromExtension || !toExtension) return undefined;
  const actualTo = toExtension === "pdfx" ? "pdfa" : toExtension;
  const url = getEndpointUrl(fromExtension, actualTo);
  return url && isToolEndpoint(url) ? url : undefined;
};

/**
 * A convert step spans many backend endpoints, each with its own request model, so its body can't
 * be typed as a single generated model. It is built from the same buildConvertFormData the client
 * runner uses - the one source of truth for each conversion's fields - and cast at this boundary.
 * `fromExtension`/`toExtension` ride along as bookkeeping: the endpoints ignore them (they are
 * encoded in the path), but the chosen conversion can't be reconstructed from the body alone, so
 * they let deserialize recover it. See toolAutomation.serializeToolStep.
 */
export const convertToApiParams = (
  params: ConvertParameters,
): ToolApiParams[ToolEndpoint] => {
  const dummy = new File([], "input", { type: "application/octet-stream" });
  const formData = buildConvertFormData(params, [dummy]);
  const body: Record<string, string> = {
    fromExtension: params.fromExtension,
    toExtension: params.toExtension,
  };
  // Keep the scalar fields; the file part (fileInput) is fed separately by the engine.
  formData.forEach((value, key) => {
    if (typeof value === "string") body[key] = value;
  });
  return body as unknown as ToolApiParams[ToolEndpoint];
};

/**
 * The fields a convert endpoint accepts - taken from its generated request model - but valued as the
 * strings a stored, form-shaped step actually holds. Keying off the model's `keyof` means a reader
 * can only read a field that endpoint really takes (a typo is a compile error). Values stay strings
 * because that is what a serialized step carries; and two of these models spell their enum *values*
 * for the backend rather than for the tool (colorType, fitOption), so values are validated against
 * the frontend's own sets (asEnum) rather than the model's.
 */
type ConvertStepBody<E extends ToolEndpoint> = Partial<
  Record<keyof ToolApiParams[E], string>
>;

/** Per-endpoint readers: each is handed exactly its endpoint's fields. */
type ConvertOptionReaders = {
  [E in ToolEndpoint]?: (
    body: ConvertStepBody<E>,
    toExtension: string,
  ) => Partial<ConvertParameters>;
};

/** The reader shape collapsed for the runtime dispatch, where the endpoint is only a string. */
type ConvertOptionReader = (
  body: Record<string, string | undefined>,
  toExtension: string,
) => Partial<ConvertParameters>;

// The stored values are strings; these read one back into the typed shape ConvertParameters expects,
// validating an enum against its allowed set (asEnum) rather than blind-casting an arbitrary string.
const asFlag = (value: string | undefined): boolean => value === "true";
const asInt = (value: string | undefined, fallback: number): number =>
  value !== undefined && value !== "" ? Number(value) : fallback;
const asEnum = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

const COLOR_TYPE_VALUES = [
  COLOR_TYPES.COLOR,
  COLOR_TYPES.GRAYSCALE,
  COLOR_TYPES.BLACK_WHITE,
] as const;
const OUTPUT_OPTION_VALUES = [
  OUTPUT_OPTIONS.SINGLE,
  OUTPUT_OPTIONS.MULTIPLE,
] as const;
const FIT_OPTION_VALUES = [
  FIT_OPTIONS.FIT_PAGE,
  FIT_OPTIONS.MAINTAIN_ASPECT,
  FIT_OPTIONS.FILL_PAGE,
] as const;

/**
 * How each convert endpoint's stored options map back into the tool's parameter groups, keyed by the
 * endpoint the step targets. Only endpoints carrying configurable options appear; the rest are fully
 * described by their from/to pair. `/api/v1/convert/pdf/pdfa` backs both PDF/A and PDF/X, so its
 * reader takes the target extension to tell them apart. Groups a reader omits fall back to defaults
 * via the merge in deserializeToolStep.
 */
const CONVERT_OPTION_READERS: ConvertOptionReaders = {
  "/api/v1/convert/pdf/img": (body) => ({
    imageOptions: {
      ...defaultParameters.imageOptions,
      colorType: asEnum(
        body.colorType,
        COLOR_TYPE_VALUES,
        defaultParameters.imageOptions.colorType,
      ),
      dpi: asInt(body.dpi, defaultParameters.imageOptions.dpi),
      singleOrMultiple: asEnum(
        body.singleOrMultiple,
        OUTPUT_OPTION_VALUES,
        defaultParameters.imageOptions.singleOrMultiple,
      ),
    },
  }),
  "/api/v1/convert/img/pdf": (body) => ({
    imageOptions: {
      ...defaultParameters.imageOptions,
      fitOption: asEnum(
        body.fitOption,
        FIT_OPTION_VALUES,
        defaultParameters.imageOptions.fitOption,
      ),
      colorType: asEnum(
        body.colorType,
        COLOR_TYPE_VALUES,
        defaultParameters.imageOptions.colorType,
      ),
      autoRotate: asFlag(body.autoRotate),
    },
  }),
  "/api/v1/convert/svg/pdf": (body) => ({
    imageOptions: {
      ...defaultParameters.imageOptions,
      combineImages: asFlag(body.combineIntoSinglePdf),
    },
  }),
  "/api/v1/convert/html/pdf": (body) => ({
    htmlOptions: {
      zoomLevel: asInt(body.zoom, defaultParameters.htmlOptions.zoomLevel),
    },
  }),
  "/api/v1/convert/eml/pdf": (body) => ({
    emailOptions: {
      includeAttachments: asFlag(body.includeAttachments),
      maxAttachmentSizeMB: asInt(
        body.maxAttachmentSizeMB,
        defaultParameters.emailOptions.maxAttachmentSizeMB,
      ),
      downloadHtml: asFlag(body.downloadHtml),
      includeAllRecipients: asFlag(body.includeAllRecipients),
    },
  }),
  "/api/v1/convert/pdf/pdfa": (body, toExtension) =>
    toExtension === "pdfx"
      ? {
          pdfxOptions: {
            outputFormat:
              body.outputFormat ?? defaultParameters.pdfxOptions.outputFormat,
          },
        }
      : {
          pdfaOptions: {
            outputFormat:
              body.outputFormat ?? defaultParameters.pdfaOptions.outputFormat,
            strict: asFlag(body.strict),
          },
        },
  "/api/v1/convert/cbr/pdf": (body) => ({
    cbrOptions: { optimizeForEbook: asFlag(body.optimizeForEbook) },
  }),
  "/api/v1/convert/pdf/cbr": (body) => ({
    pdfToCbrOptions: {
      dpi: asInt(body.dpi, defaultParameters.pdfToCbrOptions.dpi),
    },
  }),
  "/api/v1/convert/cbz/pdf": (body) => ({
    cbzOptions: { optimizeForEbook: asFlag(body.optimizeForEbook) },
  }),
  "/api/v1/convert/pdf/cbz": (body) => ({
    cbzOutputOptions: {
      dpi: asInt(body.dpi, defaultParameters.cbzOutputOptions.dpi),
    },
  }),
  "/api/v1/convert/ebook/pdf": (body) => ({
    ebookOptions: {
      embedAllFonts: asFlag(body.embedAllFonts),
      includeTableOfContents: asFlag(body.includeTableOfContents),
      includePageNumbers: asFlag(body.includePageNumbers),
      optimizeForEbook: asFlag(body.optimizeForEbook),
    },
  }),
  "/api/v1/convert/pdf/epub": (body) => {
    const fallback = defaultParameters.epubOptions;
    return {
      epubOptions: {
        detectChapters:
          body.detectChapters !== undefined
            ? asFlag(body.detectChapters)
            : (fallback?.detectChapters ?? true),
        targetDevice:
          body.targetDevice ?? fallback?.targetDevice ?? "TABLET_PHONE_IMAGES",
        outputFormat: body.outputFormat ?? fallback?.outputFormat ?? "EPUB",
      },
    };
  },
};

/**
 * Rebuild the tool's UI parameters from a stored convert step: recover the conversion from the
 * `fromExtension`/`toExtension` bookkeeping, resolve the endpoint it targeted, then hand its stored
 * options to that endpoint's reader. Re-opening a saved step shows exactly what was configured (and
 * re-saving it doesn't reset options to defaults). The generated request models can't type this: a
 * stored value is always a string, and two convert models (colorType, fitOption) declare the backend
 * spelling rather than the value the tool sends today - so options are validated against the
 * frontend's own option sets instead.
 */
export const convertFromApiParams = (
  apiParams: ToolApiParams[ToolEndpoint],
): Partial<ConvertParameters> => {
  const body = apiParams as unknown as Record<string, string | undefined>;
  const fromExtension = body.fromExtension ?? "";
  const toExtension = body.toExtension ?? "";
  const endpoint = convertEndpointFor(fromExtension, toExtension);
  // Each reader reads only its own endpoint's fields; the runtime endpoint is just a string, so the
  // precise per-endpoint type is recovered with one widening cast here (every reader accepts a
  // superset string record).
  const readOptions = endpoint
    ? (CONVERT_OPTION_READERS[endpoint] as ConvertOptionReader | undefined)
    : undefined;
  return {
    fromExtension,
    toExtension,
    ...(readOptions ? readOptions(body, toExtension) : {}),
  };
};

// Static configuration object
export const convertOperationConfig = defineCustomTool({
  validateParams: validateConvertParameters,
  customProcessor: convertProcessor, // Can't use callback version here
  operationType: "convert",
  defaultParameters,
  endpoint: (params: ConvertParameters): string | undefined =>
    convertEndpointFor(params.fromExtension, params.toExtension),
  // Routing set for a dynamic endpoint, so a stored convert step maps back to this tool.
  endpoints: CONVERT_AUTOMATION_ENDPOINTS,
  toApiParams: convertToApiParams,
  fromApiParams: convertFromApiParams,
});

export const useConvertOperation = (parameters?: ConvertParameters) => {
  const { t } = useTranslation();

  // Calculate current endpoint name for cloud detection
  const currentEndpointName = useMemo(() => {
    if (!parameters?.fromExtension || !parameters?.toExtension)
      return undefined;

    // Map PDF/X to use PDF/A endpoint (same as in convertProcessor)
    const actualToExtension =
      parameters.toExtension === "pdfx" ? "pdfa" : parameters.toExtension;
    return getEndpointName(parameters.fromExtension, actualToExtension);
  }, [parameters?.fromExtension, parameters?.toExtension]);

  // Check if current conversion will use cloud
  const willUseCloud = useToolCloudStatus(currentEndpointName);

  const customConvertProcessor = useCallback(
    async (
      parameters: ConvertParameters,
      selectedFiles: File[],
    ): Promise<CustomProcessorResult> => {
      return convertProcessor(parameters, selectedFiles);
    },
    [],
  );

  const operation = useToolOperation<ConvertParameters>({
    ...convertOperationConfig,
    customProcessor: customConvertProcessor, // Use instance-specific processor for translation support
    getErrorMessage: (error) => {
      const err = error as {
        response?: { data?: unknown };
        message?: string;
      };
      if (err.response?.data && typeof err.response.data === "string") {
        return err.response.data;
      }
      if (err.message) {
        return err.message;
      }
      return t(
        "convert.errorConversion",
        "An error occurred while converting the file.",
      );
    },
  });

  // Override willUseCloud with our calculated value
  return {
    ...operation,
    willUseCloud,
  };
};
