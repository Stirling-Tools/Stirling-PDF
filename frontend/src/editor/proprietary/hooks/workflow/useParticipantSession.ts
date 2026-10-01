import { useState, useCallback, useEffect } from "react";
import { isAxiosError } from "axios";
import workflowService, {
  WorkflowSessionResponse,
  ParticipantResponse,
  SignatureSubmissionRequest,
} from "@app/services/workflowService";

export interface UseParticipantSessionResult {
  session: WorkflowSessionResponse | null;
  participant: ParticipantResponse | null;
  loading: boolean;
  error: string | null;
  loadSession: (token: string) => Promise<void>;
  submitSignature: (request: SignatureSubmissionRequest) => Promise<void>;
  decline: (token: string, reason?: string) => Promise<void>;
  downloadDocument: (token: string) => Promise<void>;
}

/**
 * Hook for managing workflow session from participant perspective
 */
export const useParticipantSession = (
  token?: string,
): UseParticipantSessionResult => {
  const [session, setSession] = useState<WorkflowSessionResponse | null>(null);
  const [participant, setParticipant] = useState<ParticipantResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const [sessionData, participantData] = await Promise.all([
        workflowService.getSessionByToken(token),
        workflowService.getParticipantDetails(token),
      ]);
      setSession(sessionData);
      setParticipant(participantData);
    } catch (err: unknown) {
      const errorMsg = isAxiosError(err)
        ? err.response?.data?.message || err.message
        : (err instanceof Error ? err.message : undefined) ||
          "Failed to load session";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const submitSignature = useCallback(
    async (request: SignatureSubmissionRequest) => {
      setLoading(true);
      setError(null);
      try {
        const updatedParticipant =
          await workflowService.submitSignature(request);
        setParticipant(updatedParticipant);
        // Reload session to get updated status
        if (request.participantToken) {
          await loadSession(request.participantToken);
        }
      } catch (err: unknown) {
        const errorMsg = isAxiosError(err)
          ? err.response?.data?.message || err.message
          : (err instanceof Error ? err.message : undefined) ||
            "Failed to submit signature";
        setError(errorMsg);
        throw new Error(errorMsg, { cause: err });
      } finally {
        setLoading(false);
      }
    },
    [loadSession],
  );

  const decline = useCallback(
    async (token: string, reason?: string) => {
      setLoading(true);
      setError(null);
      try {
        const updatedParticipant = await workflowService.declineParticipation(
          token,
          reason,
        );
        setParticipant(updatedParticipant);
        // Reload session
        await loadSession(token);
      } catch (err: unknown) {
        const errorMsg = isAxiosError(err)
          ? err.response?.data?.message || err.message
          : (err instanceof Error ? err.message : undefined) ||
            "Failed to decline";
        setError(errorMsg);
        throw new Error(errorMsg, { cause: err });
      } finally {
        setLoading(false);
      }
    },
    [loadSession],
  );

  const downloadDocument = useCallback(
    async (token: string) => {
      setLoading(true);
      setError(null);
      try {
        const pdfBlob = await workflowService.getParticipantDocument(token);
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = session?.documentName || "document.pdf";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (err: unknown) {
        const errorMsg = isAxiosError(err)
          ? err.response?.data?.message || err.message
          : (err instanceof Error ? err.message : undefined) ||
            "Failed to download document";
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  // Auto-load session if token is provided
  useEffect(() => {
    if (token) {
      loadSession(token);
    }
  }, [token, loadSession]);

  return {
    session,
    participant,
    loading,
    error,
    loadSession,
    submitSignature,
    decline,
    downloadDocument,
  };
};
