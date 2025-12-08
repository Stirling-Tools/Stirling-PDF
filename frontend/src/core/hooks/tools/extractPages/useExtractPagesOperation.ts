import apiClient from '@app/services/apiClient';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { ExtractPagesParameters, defaultParameters } from '@app/hooks/tools/extractPages/useExtractPagesParameters';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { parseSelection } from '@app/utils/bulkselection/parseSelection';

// Convert advanced page selection expression into CSV of explicit one-based page numbers
async function resolveSelectionToCsv(expression: string, file: File): Promise<string> {
  // Load PDF to determine max pages
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer, { disableAutoFetch: true, disableStream: true });
  try {
    const maxPages = pdf.numPages;
    const pages = parseSelection(expression || '', maxPages);
    return pages.join(',');
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
}

export const extractPagesOperationConfig = {
  toolType: ToolType.custom,
  operationType: 'extractPages',
  customProcessor: async (parameters: ExtractPagesParameters, files: File[]): Promise<File[]> => {
    const outputs: File[] = [];

    for (const file of files) {
      // Resolve selection into CSV acceptable by backend
      const csv = await resolveSelectionToCsv(parameters.pageNumbers, file);

      const formData = new FormData();
      formData.append('fileInput', file);
      formData.append('pageNumbers', csv);

      const response = await apiClient.post('/api/v1/general/rearrange-pages', formData, { responseType: 'blob' });

      // Name output file with suffix
      const base = (file.name || 'document.pdf').replace(/\.[^.]+$/, '');
      const outName = `${base}_extracted_pages.pdf`;
      const outFile = new File([response.data], outName, { type: 'application/pdf' });
      outputs.push(outFile);
    }

    return outputs;
  },
  defaultParameters,
} as const;

export const useExtractPagesOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<ExtractPagesParameters>({
    ...extractPagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('extractPages.error.failed', 'Failed to extract pages'))
  });
};


