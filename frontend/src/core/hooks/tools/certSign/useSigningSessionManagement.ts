import { useState, useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import { SessionSummary, SessionDetail } from '@app/types/signingSession';

export const useSigningSessionManagement = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/security/cert-sign/sessions');
      setSessions(response.data);
    } catch (err: any) {
      console.error('Failed to fetch sessions:', err);
      setError(err.response?.data?.message || 'Failed to fetch sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessionDetail = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/api/v1/security/cert-sign/sessions/${sessionId}`);
      setActiveSession(response.data);
    } catch (err: any) {
      console.error('Failed to fetch session detail:', err);
      setError(err.response?.data?.message || 'Failed to fetch session details');
      setActiveSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/api/v1/security/cert-sign/sessions/${sessionId}`);
      // Refresh sessions list after deletion
      await fetchSessions();
      setActiveSession(null);
    } catch (err: any) {
      console.error('Failed to delete session:', err);
      setError(err.response?.data || 'Failed to delete session');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);

  const addParticipants = useCallback(
    async (sessionId: string, participants: { participantUserIds: number[] }) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.post(
          `/api/v1/security/cert-sign/sessions/${sessionId}/participants`,
          participants
        );
        setActiveSession(response.data);
        return response.data;
      } catch (err: any) {
        console.error('Failed to add participants:', err);
        setError(err.response?.data || 'Failed to add participants');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const removeParticipant = useCallback(async (sessionId: string, userId: number) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(
        `/api/v1/security/cert-sign/sessions/${sessionId}/participants/${userId}`
      );
      // Refresh session detail after removal
      await fetchSessionDetail(sessionId);
    } catch (err: any) {
      console.error('Failed to remove participant:', err);
      setError(err.response?.data || 'Failed to remove participant');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSessionDetail]);

  const finalizeSession = useCallback(async (sessionId: string, documentName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post(
        `/api/v1/security/cert-sign/sessions/${sessionId}/finalize`,
        {},
        { responseType: 'blob' }
      );

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `signed-${sessionId}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      } else if (documentName) {
        filename = documentName.replace(/\.pdf$/i, '') + '_signed.pdf';
      }

      // Create File object
      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      return file;
    } catch (err: any) {
      console.error('Failed to finalize session:', err);
      setError(err.response?.data || 'Failed to finalize session');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSignedPdf = useCallback(async (sessionId: string, documentName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/security/cert-sign/sessions/${sessionId}/signed-pdf`,
        { responseType: 'blob' }
      );

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `signed-${sessionId}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      } else if (documentName) {
        filename = documentName.replace(/\.pdf$/i, '') + '_signed.pdf';
      }

      // Create File object
      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      return file;
    } catch (err: any) {
      console.error('Failed to load signed PDF:', err);
      setError(err.response?.data || 'Failed to load signed PDF');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    sessions,
    activeSession,
    loading,
    error,
    fetchSessions,
    fetchSessionDetail,
    deleteSession,
    addParticipants,
    removeParticipant,
    finalizeSession,
    loadSignedPdf,
    setActiveSession,
  };
};
