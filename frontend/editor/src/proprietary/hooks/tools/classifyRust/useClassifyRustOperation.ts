import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import {
  createStandardErrorHandler,
  defineCustomTool,
  useToolOperation,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  fileOnlyMapping,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import {
  ClassifyRustParameters,
  defaultParameters,
} from "@app/hooks/tools/classifyRust/useClassifyRustParameters";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
  saveRawDocument,
} from "@app/services/pdfiumService";
import {
  classifyDocument,
  type RulesVerdict,
} from "@app/services/rulesClassifier";
import { classifyFileHeuristically } from "@app/services/heuristic/heuristicClassification";
import {
  emitResults,
  type ClassifyRustResult,
} from "@app/services/classifyRustResults";
import {
  addServerTime,
  emitTiming,
  parseServerTiming,
} from "@app/services/toolTiming";

export const CLASSIFY_RUST_ENDPOINT =
  "/api/v1/misc/classify-rust" satisfies ToolEndpoint;

interface Classified {
  file: File;
  verdict: RulesVerdict | null;
}

function asPdf(bytes: BlobPart, source: File): File {
  return new File([bytes], source.name, { type: "application/pdf" });
}

/**
 * Classifies `file` with the Rust wasm against the editor's own PDFium, and
 * returns it with the verdict stored in its metadata.
 */
export async function classifyInBrowser(file: File): Promise<Classified> {
  const pdfium = await getPdfiumModule();
  const document = await openRawDocumentSafe(await file.arrayBuffer());
  try {
    const verdict = await classifyDocument(document, file.name, true);
    return { file: asPdf(await saveRawDocument(document), file), verdict };
  } finally {
    closeDocAndFreeBuffer(pdfium, document);
  }
}

/** The verdict the server sends Base64-encoded in X-Stirling-Classification. */
export function decodeVerdict(header: unknown): RulesVerdict | null {
  if (typeof header !== "string" || header.length === 0) return null;
  try {
    const utf8 = Uint8Array.from(atob(header), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(utf8)) as RulesVerdict;
  } catch {
    return null;
  }
}

async function classifyOnServer(
  file: File,
): Promise<Classified & { processingMs: number | null }> {
  const formData = new FormData();
  formData.append("fileInput", file);
  const response = await apiClient.post<Blob>(
    CLASSIFY_RUST_ENDPOINT,
    formData,
    { responseType: "blob" },
  );
  return {
    file: asPdf(response.data, file),
    verdict: decodeVerdict(response.headers?.["x-stirling-classification"]),
    processingMs: parseServerTiming(response.headers?.["server-timing"]),
  };
}

async function processFiles(
  params: ClassifyRustParameters,
  files: File[],
): Promise<CustomProcessorResult> {
  const started = performance.now();
  let serverProcessingMs: number | null = params.processOnServer ? 0 : null;
  // One at a time: the browser path shares a single PDFium instance.
  const classified: Classified[] = [];
  for (const file of files) {
    if (params.processOnServer) {
      const result = await classifyOnServer(file);
      classified.push(result);
      serverProcessingMs = addServerTime(
        serverProcessingMs,
        result.processingMs,
      );
    } else {
      classified.push(await classifyInBrowser(file));
    }
  }
  emitTiming({
    tool: "classify",
    implementation: "rust",
    location: params.processOnServer ? "server" : "browser",
    files: files.length,
    totalMs: performance.now() - started,
    serverProcessingMs,
  });

  // After the timed run, so comparing does not count against the Rust time.
  const results: ClassifyRustResult[] = [];
  for (const [index, file] of files.entries()) {
    results.push({
      fileName: file.name,
      rust: classified[index].verdict,
      typescript: await classifyFileHeuristically(file).catch(() => null),
    });
  }
  emitResults(results);
  return { files: classified.map((result) => result.file) };
}

export const classifyRustOperationConfig =
  defineCustomTool<ClassifyRustParameters>({
    customProcessor: processFiles,
    operationType: "classifyRust",
    endpoint: (params) =>
      params.processOnServer ? CLASSIFY_RUST_ENDPOINT : undefined,
    // What a pipeline runs: the step always executes on the server.
    endpoints: [CLASSIFY_RUST_ENDPOINT],
    ...fileOnlyMapping(),
    defaultParameters,
  });

export const useClassifyRustOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<ClassifyRustParameters>({
    ...classifyRustOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("classifyRust.error.failed", "Failed to classify the PDF"),
    ),
  });
};
