import apiClient from "@app/services/apiClient";
import {
  ToolType,
  CustomToolOperationConfig,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/toolOperationTypes";
import {
  PdfCommentAgentParameters,
  defaultParameters,
} from "@app/hooks/tools/pdfCommentAgent/usePdfCommentAgentParameters";

export const PDF_COMMENT_AGENT_ENDPOINT = "/api/v1/ai/tools/pdf-comment-agent";

/** Build the multipart payload Java expects: fileInput + prompt. */
export const buildPdfCommentAgentFormData = (
  parameters: PdfCommentAgentParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("prompt", parameters.prompt);
  return formData;
};

/**
 * Reject filenames that are blank or contain path separators. The server is
 * trusted to supply a sensible value, but guarding here means a hostile or
 * buggy backend cannot convince the browser save-dialog to steer the download
 * into a parent directory.
 */
const sanitiseFilename = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[\\/]/.test(trimmed)) return null;
  return trimmed;
};

/**
 * Extract the filename from a Content-Disposition header, falling back to a
 * sensible default based on the input file name. Handles both the quoted and
 * RFC 5987 (``filename*=UTF-8''encoded``) forms.
 */
const filenameFromContentDisposition = (
  header: string | undefined,
  inputName: string,
): string => {
  const fallback = inputName.replace(/\.pdf$/i, "") + "-commented.pdf";
  if (!header) return fallback;

  // RFC 5987: filename*=UTF-8''encoded
  const extended = /filename\*=[^']*''([^;]+)/i.exec(header);
  if (extended?.[1]) {
    try {
      const decoded = sanitiseFilename(decodeURIComponent(extended[1]));
      if (decoded) return decoded;
    } catch {
      // fall through to plain form
    }
  }

  // Plain: filename="..." or filename=...
  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain?.[1]) {
    const sanitised = sanitiseFilename(plain[1]);
    if (sanitised) return sanitised;
  }
  return fallback;
};

/**
 * Custom processor: POST the PDF + prompt to the Java AI endpoint, which streams
 * the annotated PDF back. Wrap the response Blob as a File so the standard
 * review panel (embedPDF viewer) renders it with the sticky-note annotations.
 */
const processPdfCommentAgent = async (
  parameters: PdfCommentAgentParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  if (files.length === 0) {
    return { files: [] };
  }

  const [inputFile] = files;
  const formData = buildPdfCommentAgentFormData(parameters, inputFile);

  const response = await apiClient.post<Blob>(
    PDF_COMMENT_AGENT_ENDPOINT,
    formData,
    { responseType: "blob" },
  );

  const dispositionHeader =
    (response.headers as Record<string, string | undefined>)[
      "content-disposition"
    ] ?? undefined;
  const fileName = filenameFromContentDisposition(
    dispositionHeader,
    inputFile.name,
  );

  const resultFile = new File([response.data], fileName, {
    type: response.data.type || "application/pdf",
  });
  return { files: [resultFile] };
};

export const pdfCommentAgentOperationConfig = {
  toolType: ToolType.custom,
  operationType: "pdfCommentAgent",
  endpoint: PDF_COMMENT_AGENT_ENDPOINT,
  customProcessor: processPdfCommentAgent,
  defaultParameters,
} as const satisfies CustomToolOperationConfig<PdfCommentAgentParameters>;
