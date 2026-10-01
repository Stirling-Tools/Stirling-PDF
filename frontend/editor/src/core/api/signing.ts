import apiClient from "@app/services/apiClient";
import type {
  SignRequestSummary,
  SessionSummary,
} from "@app/types/signingSession";

export interface SigningSessions {
  signRequests: SignRequestSummary[];
  mySessions: SessionSummary[];
}

/** Reads both signing lists without global toasts; the caller owns error reporting. */
export async function fetchSigningSessions(): Promise<SigningSessions> {
  const [requests, sessions] = await Promise.all([
    apiClient.get<SignRequestSummary[]>(
      "/api/v1/security/cert-sign/sign-requests",
      { suppressErrorToast: true },
    ),
    apiClient.get<SessionSummary[]>("/api/v1/security/cert-sign/sessions", {
      suppressErrorToast: true,
    }),
  ]);
  return { signRequests: requests.data, mySessions: sessions.data };
}

/** Fetches a small authenticated preview; unavailable previews must not block opening the session. */
export async function fetchSigningThumbnail(
  sessionId: string,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `/api/v1/security/cert-sign/sessions/${encodeURIComponent(sessionId)}/thumbnail`,
    { responseType: "blob", suppressErrorToast: true, signal },
  );
  return response.data;
}
