import { useState, useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import type { SignaturePreview } from '@app/components/viewer/LocalEmbedPDFWithAnnotations';

export interface CombinedSignResult {
  blob: Blob;
  filename: string;
}

export interface UseCombinedSignOperationReturn {
  submitCertSign: (file: File, formData: FormData) => Promise<CombinedSignResult>;
  submitWetOnly: (file: File, previews: SignaturePreview[]) => Promise<CombinedSignResult>;
  loading: boolean;
}

/**
 * Operation hook for the combined sign tool.
 *
 * - submitCertSign: posts a pre-built FormData to /api/v1/security/cert-sign and
 *   returns the signed PDF blob.
 * - submitWetOnly: sequentially applies each wet-signature preview via
 *   /api/v1/security/add-signature (one call per signature, chained).
 *
 * Coordinates from LocalEmbedPDFWithAnnotations are normalised 0-1 fractions;
 * both endpoints are expected to accept this format.
 */
export const useCombinedSignOperation = (): UseCombinedSignOperationReturn => {
  const [loading, setLoading] = useState(false);

  const extractFilename = (headers: any, fallback: string): string => {
    const disposition: string = headers['content-disposition'] ?? '';
    const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (match?.[1]) return match[1].replace(/['"]/g, '');
    return fallback;
  };

  const submitCertSign = useCallback(async (file: File, formData: FormData): Promise<CombinedSignResult> => {
    setLoading(true);
    try {
      const response = await apiClient.post('/api/v1/security/cert-sign', formData, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      return { blob, filename: extractFilename(response.headers, `signed_${file.name}`) };
    } finally {
      setLoading(false);
    }
  }, []);

  const submitWetOnly = useCallback(async (file: File, previews: SignaturePreview[]): Promise<CombinedSignResult> => {
    setLoading(true);
    try {
      let currentFile: File = file;
      for (const preview of previews) {
        const formData = new FormData();
        formData.append('fileInput', currentFile);
        formData.append('signatureData', preview.signatureData);
        formData.append('signatureType', preview.signatureType);
        formData.append('x', preview.x.toString());
        formData.append('y', preview.y.toString());
        formData.append('width', preview.width.toString());
        formData.append('height', preview.height.toString());
        formData.append('page', preview.pageIndex.toString());

        const response = await apiClient.post('/api/v1/security/add-signature', formData, {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        currentFile = new File([blob], file.name, { type: 'application/pdf' });
      }
      return { blob: currentFile, filename: `signed_${file.name}` };
    } finally {
      setLoading(false);
    }
  }, []);

  return { submitCertSign, submitWetOnly, loading };
};
