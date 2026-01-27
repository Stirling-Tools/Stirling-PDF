import { useState, useCallback } from 'react';
import workflowService, {
  WorkflowCreationRequest,
  WorkflowSessionResponse,
  SignatureSubmissionRequest,
} from '@app/proprietary/services/workflowService';

export interface UseWorkflowSessionResult {
  sessions: WorkflowSessionResponse[];
  activeSessions: WorkflowSessionResponse[];
  currentSession: WorkflowSessionResponse | null;
  loading: boolean;
  error: string | null;
  createSession: (file: File, request: WorkflowCreationRequest) => Promise<WorkflowSessionResponse>;
  loadSessions: () => Promise<void>;
  loadActiveSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  finalizeSession: (sessionId: string) => Promise<Blob>;
  downloadSignedPdf: (sessionId: string) => Promise<void>;
  downloadOriginalPdf: (sessionId: string) => Promise<void>;
}

/**
 * Hook for managing workflow sessions (owner perspective)
 */
export const useWorkflowSession = (): UseWorkflowSessionResult => {
  const [sessions, setSessions] = useState<WorkflowSessionResponse[]>([]);
  const [activeSessions, setActiveSessions] = useState<WorkflowSessionResponse[]>([]);
  const [currentSession, setCurrentSession] = useState<WorkflowSessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(
    async (file: File, request: WorkflowCreationRequest): Promise<WorkflowSessionResponse> => {
      setLoading(true);
      setError(null);
      try {
        const session = await workflowService.createSession(file, request);
        setCurrentSession(session);
        return session;
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to create session';
        setError(errorMsg);
        throw new Error(errorMsg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await workflowService.listSessions();
      setSessions(data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load sessions';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActiveSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await workflowService.listActiveSessions();
      setActiveSessions(data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load active sessions';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await workflowService.getSession(sessionId);
      setCurrentSession(session);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load session';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await workflowService.deleteSession(sessionId);
      // Remove from lists
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      setActiveSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (currentSession?.sessionId === sessionId) {
        setCurrentSession(null);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to delete session';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  const finalizeSession = useCallback(async (sessionId: string): Promise<Blob> => {
    setLoading(true);
    setError(null);
    try {
      const pdfBlob = await workflowService.finalizeSession(sessionId);
      // Reload session to get updated status
      await loadSession(sessionId);
      return pdfBlob;
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to finalize session';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [loadSession]);

  const downloadSignedPdf = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const pdfBlob = await workflowService.getSignedPdf(sessionId);
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sessionId}_signed.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to download signed PDF';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadOriginalPdf = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const pdfBlob = await workflowService.getOriginalPdf(sessionId);
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sessionId}_original.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to download original PDF';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    sessions,
    activeSessions,
    currentSession,
    loading,
    error,
    createSession,
    loadSessions,
    loadActiveSessions,
    loadSession,
    deleteSession,
    finalizeSession,
    downloadSignedPdf,
    downloadOriginalPdf,
  };
};
