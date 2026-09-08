import apiClient from "@app/services/apiClient";
import type {
  SignRequestSummary,
  SessionSummary,
} from "@app/types/signingSession";

export interface SigningSessions {
  signRequests: SignRequestSummary[];
  mySessions: SessionSummary[];
}

/** The two lists the signing UI always needs together. */
export async function fetchSigningSessions(): Promise<SigningSessions> {
  const [requests, sessions] = await Promise.all([
    apiClient.get<SignRequestSummary[]>(
      "/api/v1/security/cert-sign/sign-requests",
    ),
    apiClient.get<SessionSummary[]>("/api/v1/security/cert-sign/sessions"),
  ]);
  return { signRequests: requests.data, mySessions: sessions.data };
}
