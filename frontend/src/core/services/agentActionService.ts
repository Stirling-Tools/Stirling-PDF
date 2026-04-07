/**
 * Agent Action Execution Service.
 *
 * Executes approved agent actions by calling the appropriate Stirling API endpoints.
 * Each action type (auto_redact, form_fill, etc.) maps to a specific API call.
 */

import apiClient from '@app/services/apiClient';

interface AutoRedactMatch {
  text: string;
  category: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

interface AutoRedactPayload {
  matches: AutoRedactMatch[];
  fileNames: string[];
}

export interface ActionFileResult {
  inputFile: File;
  outputBlob: Blob;
  outputFileName: string;
}

export interface ActionError {
  fileName: string;
  error: string;
}

export interface ActionResult {
  successes: ActionFileResult[];
  errors: ActionError[];
}

/**
 * Execute an agent action on all relevant files.
 * Returns successes and per-file errors so the UI can display them.
 */
export async function executeAgentAction(
  actionType: string,
  actionPayload: unknown,
  activeFiles: File[],
): Promise<ActionResult> {
  switch (actionType) {
    case 'auto_redact':
      return executeAutoRedact(actionPayload as AutoRedactPayload, activeFiles);
    case 'edit_plan':
      return executeEditPlan(actionPayload as EditPlanPayload, activeFiles);
    default:
      return { successes: [], errors: [{ fileName: '', error: `Unknown action type: ${actionType}` }] };
  }
}

async function executeAutoRedact(
  payload: AutoRedactPayload,
  activeFiles: File[],
): Promise<ActionResult> {
  const textsToRedact = payload.matches.map((m) => m.text).filter(Boolean);

  // Sanitize: strip CR, trim, flatten multi-line items
  const sanitized = textsToRedact
    .flatMap((t) => t.replace(/\r/g, '').split('\n'))
    .map((t) => t.trim())
    .filter(Boolean);

  if (sanitized.length === 0) {
    return { successes: [], errors: [{ fileName: '', error: 'No text values to redact' }] };
  }

  // Determine which files to process — all active PDFs
  const pdfFiles = activeFiles.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfFiles.length === 0) {
    return { successes: [], errors: [{ fileName: '', error: 'No PDF files available to redact' }] };
  }

  const successes: ActionFileResult[] = [];
  const errors: ActionError[] = [];

  for (const file of pdfFiles) {
    try {
      const resultBlob = await redactSingleFile(file, sanitized);
      if (resultBlob) {
        successes.push({
          inputFile: file,
          outputBlob: resultBlob,
          outputFileName: file.name,
        });
      }
    } catch (err) {
      const errorMsg = await extractErrorMessage(err, file.name);
      errors.push({ fileName: file.name, error: errorMsg });
    }
  }

  return { successes, errors };
}

/**
 * Redact a single file by chaining one API call per text item.
 * Spring's StrictHttpFirewall rejects newlines in multipart form values,
 * so we send one item at a time. Includes retry logic for transient failures.
 */
async function redactSingleFile(file: File, sanitizedTexts: string[]): Promise<Blob | null> {
  let currentFile: File = file;

  for (let i = 0; i < sanitizedTexts.length; i++) {
    let lastError: unknown;
    let success = false;

    // Retry once on failure
    for (let attempt = 0; attempt < 2 && !success; attempt++) {
      try {
        const formData = new FormData();
        formData.append('fileInput', currentFile);
        formData.append('listOfText', sanitizedTexts[i]);
        formData.append('useRegex', 'false');
        formData.append('wholeWordSearch', 'false');
        formData.append('redactColor', '000000');
        formData.append('customPadding', '0.1');
        formData.append('convertPDFToImage', 'false');

        const response = await apiClient.post('/api/v1/security/auto-redact', formData, {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        currentFile = new File([blob], file.name, { type: 'application/pdf' });
        success = true;
      } catch (err: unknown) {
        lastError = err;
        if (attempt === 0) {
          // Brief pause before retry
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    if (!success) {
      throw lastError;
    }
  }

  return new Blob([await currentFile.arrayBuffer()], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Edit Plan execution
// ---------------------------------------------------------------------------

interface EditPlanStep {
  tool: string;
  parameters: Record<string, unknown>;
}

interface EditPlanPayload {
  summary: string;
  steps: EditPlanStep[];
  fileNames: string[];
}

/**
 * Map from Python OperationId values to Stirling API endpoint paths.
 * Only the most common operations are mapped; unmapped ones will error gracefully.
 */
const TOOL_ENDPOINT_MAP: Record<string, string> = {
  rotate: '/api/v1/general/rotate-pdf',
  compress: '/api/v1/misc/compress-pdf',
  merge: '/api/v1/general/merge-pdfs',
  split: '/api/v1/general/split-pages',
  ocr: '/api/v1/misc/ocr-pdf',
  watermark: '/api/v1/security/add-watermark',
  removePages: '/api/v1/general/remove-pages',
  extractPages: '/api/v1/general/split-pages',
  addPassword: '/api/v1/security/add-password',
  removePassword: '/api/v1/security/remove-password',
  redact: '/api/v1/security/auto-redact',
  flatten: '/api/v1/misc/flatten',
  repair: '/api/v1/misc/repair',
  changeMetadata: '/api/v1/misc/update-metadata',
  scalePages: '/api/v1/general/scale-pages',
  crop: '/api/v1/general/crop',
  adjustContrast: '/api/v1/misc/adjust-contrast',
  removeAnnotations: '/api/v1/misc/remove-annotations',
  removeBlanks: '/api/v1/misc/remove-blanks',
  removeImage: '/api/v1/misc/remove-image-pdf',
  replaceColor: '/api/v1/misc/replace-color',
  sanitize: '/api/v1/security/sanitize-pdf',
  convert: '/api/v1/convert/pdf',
  pageLayout: '/api/v1/general/multi-page-layout',
  bookletImposition: '/api/v1/general/booklet-imposition',
  reorganizePages: '/api/v1/general/rearrange-pages',
  pdfToSinglePage: '/api/v1/general/pdf-to-single-page',
  overlayPdfs: '/api/v1/general/overlay-pdfs',
  sign: '/api/v1/security/sign',
  extractImages: '/api/v1/misc/extract-images',
  changePermissions: '/api/v1/security/change-permissions',
  autoRename: '/api/v1/misc/auto-rename',
  addAttachments: '/api/v1/misc/add-attachments',
  editTableOfContents: '/api/v1/misc/edit-table-of-contents',
};

async function executeEditPlan(
  payload: EditPlanPayload,
  activeFiles: File[],
): Promise<ActionResult> {
  const pdfFiles = activeFiles.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfFiles.length === 0) {
    return { successes: [], errors: [{ fileName: '', error: 'No PDF files available' }] };
  }

  const successes: ActionFileResult[] = [];
  const errors: ActionError[] = [];

  // Execute the plan steps sequentially on each file (each step's output feeds the next)
  for (const file of pdfFiles) {
    try {
      let currentFile: File = file;

      for (let i = 0; i < payload.steps.length; i++) {
        const step = payload.steps[i];
        const endpoint = TOOL_ENDPOINT_MAP[step.tool];

        if (!endpoint) {
          throw new Error(`Unsupported operation: ${step.tool}`);
        }

        const formData = new FormData();
        formData.append('fileInput', currentFile);

        // Append all parameters from the AI-generated plan
        for (const [key, value] of Object.entries(step.parameters)) {
          if (key === 'fileInput') continue; // already appended
          if (value === null || value === undefined) continue;

          // Convert float-like integers (e.g. 90.0 → "90") for Java Integer params
          if (typeof value === 'number') {
            formData.append(key, Number.isInteger(value) ? String(value) : String(Math.round(value)));
          } else if (typeof value === 'boolean') {
            formData.append(key, String(value));
          } else {
            formData.append(key, String(value));
          }
        }

        const response = await apiClient.post(endpoint, formData, {
          responseType: 'blob',
        });

        const blob = new Blob([response.data], { type: 'application/pdf' });
        currentFile = new File([blob], file.name, { type: 'application/pdf' });
      }

      successes.push({
        inputFile: file,
        outputBlob: new Blob([await currentFile.arrayBuffer()], { type: 'application/pdf' }),
        outputFileName: file.name,
      });
    } catch (err) {
      const errorMsg = await extractErrorMessage(err, file.name);
      errors.push({ fileName: file.name, error: errorMsg });
    }
  }

  return { successes, errors };
}

/** Extract a human-readable error message from an Axios error or generic error. */
async function extractErrorMessage(err: unknown, fileName: string): Promise<string> {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: Blob | string; status?: number; statusText?: string } };
    const status = axiosErr.response?.status;

    // Try to read error body
    if (axiosErr.response?.data instanceof Blob) {
      try {
        const text = await axiosErr.response.data.text();
        // Try to parse as JSON for structured error
        try {
          const json = JSON.parse(text);
          if (json.message) return `${fileName}: ${json.message}`;
        } catch { /* not JSON */ }
        if (text.length < 200) return `${fileName}: ${text}`;
      } catch { /* can't read blob */ }
    }

    if (status === 500) return `${fileName}: Server error during redaction`;
    if (status === 413) return `${fileName}: File too large for redaction`;
    if (status === 400) return `${fileName}: Invalid redaction request`;
    return `${fileName}: Request failed (${status ?? 'unknown'})`;
  }

  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return `${fileName}: Could not connect to the server`;
  }

  if (err instanceof Error) {
    return `${fileName}: ${err.message}`;
  }

  return `${fileName}: Unknown error`;
}
