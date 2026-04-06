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

/**
 * Execute an agent action on all relevant files.
 * Returns an array of results (one per processed file).
 */
export async function executeAgentAction(
  actionType: string,
  actionPayload: unknown,
  activeFiles: File[],
): Promise<ActionFileResult[]> {
  switch (actionType) {
    case 'auto_redact':
      return executeAutoRedact(actionPayload as AutoRedactPayload, activeFiles);
    default:
      console.warn(`[AgentAction] Unknown action type: ${actionType}`);
      return [];
  }
}

async function executeAutoRedact(
  payload: AutoRedactPayload,
  activeFiles: File[],
): Promise<ActionFileResult[]> {
  const textsToRedact = payload.matches.map((m) => m.text).filter(Boolean);

  // Sanitize: strip CR, trim, flatten multi-line items
  const sanitized = textsToRedact
    .flatMap((t) => t.replace(/\r/g, '').split('\n'))
    .map((t) => t.trim())
    .filter(Boolean);

  if (sanitized.length === 0) {
    console.warn('[AgentAction] No text values to redact');
    return [];
  }

  // Determine which files to process — all active PDFs
  const pdfFiles = activeFiles.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfFiles.length === 0) {
    console.warn('[AgentAction] No PDF files to redact');
    return [];
  }

  const results: ActionFileResult[] = [];

  for (const file of pdfFiles) {
    try {
      const resultBlob = await redactSingleFile(file, sanitized);
      if (resultBlob) {
        results.push({
          inputFile: file,
          outputBlob: resultBlob,
          outputFileName: file.name, // Keep same name for versioning
        });
      }
    } catch (err) {
      console.error(`[AgentAction] Failed to redact ${file.name}:`, err);
      // Continue with other files
    }
  }

  return results;
}

/**
 * Redact a single file by chaining one API call per text item.
 * Spring's StrictHttpFirewall rejects \r\n in multipart form values,
 * so we send one item at a time to avoid newlines in the field value.
 */
async function redactSingleFile(file: File, sanitizedTexts: string[]): Promise<Blob | null> {
  let currentFile: File = file;

  for (let i = 0; i < sanitizedTexts.length; i++) {
    const formData = new FormData();
    formData.append('fileInput', currentFile);
    formData.append('listOfText', sanitizedTexts[i]);
    formData.append('useRegex', 'false');
    formData.append('wholeWordSearch', 'false');
    formData.append('redactColor', '000000');
    formData.append('customPadding', '0.1');
    formData.append('convertPDFToImage', 'false');

    try {
      const response = await apiClient.post('/api/v1/security/auto-redact', formData, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      currentFile = new File([blob], file.name, { type: 'application/pdf' });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: Blob; status?: number } };
        if (axiosErr.response?.data instanceof Blob) {
          const text = await axiosErr.response.data.text();
          console.error(`[AgentAction] redact pass ${i + 1}/${sanitizedTexts.length} on ${file.name}:`, axiosErr.response.status, text);
        }
      }
      throw err;
    }
  }

  return new Blob([await currentFile.arrayBuffer()], { type: 'application/pdf' });
}
