import apiClient from "@editor/services/apiClient";
import type {
  SignRequestSummary,
  SessionSummary,
} from "@editor/types/signingSession";

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
