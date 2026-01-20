import { useState, useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import { SignRequestSummary, SignRequestDetail } from '@app/types/signingSession';

export const useSignRequestManagement = () => {
  const [signRequests, setSignRequests] = useState<SignRequestSummary[]>([]);
  const [activeRequest, setActiveRequest] = useState<SignRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSignRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/security/cert-sign/sign-requests');
      setSignRequests(response.data);
    } catch (err: any) {
      console.error('Failed to fetch sign requests:', err);
      setError(err.response?.data?.message || 'Failed to fetch sign requests');
      setSignRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSignRequestDetail = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch sign request detail from participant endpoint
      const response = await apiClient.get(`/api/v1/security/cert-sign/sign-requests/${sessionId}`);
      setActiveRequest(response.data);
    } catch (err: any) {
      console.error('Failed to fetch sign request detail:', err);
      setError(err.response?.data?.message || 'Failed to fetch sign request details');
      setActiveRequest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signRequest = useCallback(async (sessionId: string, userId: number, certificateData: FormData) => {
    setLoading(true);
    setError(null);
    try {
      // Use the new /sign endpoint that supports both certificates and wet signatures
      const response = await apiClient.post(
        `/api/v1/security/cert-sign/sessions/${sessionId}/sign`,
        certificateData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      // Refresh sign requests list after signing
      await fetchSignRequests();
      return response.data;
    } catch (err: any) {
      console.error('Failed to sign request:', err);
      setError(err.response?.data || 'Failed to sign document');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSignRequests]);

  const declineRequest = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/security/cert-sign/sign-requests/${sessionId}/decline`);
      // Refresh sign requests list after declining
      await fetchSignRequests();
      setActiveRequest(null);
    } catch (err: any) {
      console.error('Failed to decline request:', err);
      setError(err.response?.data || 'Failed to decline request');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSignRequests]);

  const fetchSessionPdf = useCallback(async (sessionId: string, documentName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/security/cert-sign/sessions/${sessionId}/pdf`,
        { responseType: 'blob' }
      );

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `document-${sessionId}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      } else if (documentName) {
        filename = documentName;
      }

      // Create File object
      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      return file;
    } catch (err: any) {
      console.error('Failed to fetch session PDF:', err);
      setError(err.response?.data || 'Failed to fetch PDF');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    signRequests,
    activeRequest,
    loading,
    error,
    fetchSignRequests,
    fetchSignRequestDetail,
    signRequest,
    declineRequest,
    fetchSessionPdf,
    setActiveRequest,
  };
};
