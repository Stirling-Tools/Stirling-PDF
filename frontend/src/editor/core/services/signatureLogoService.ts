import apiClient from "@editor/services/apiClient";

const LOGO_URL = "/api/v1/security/cert-sign/logo";

export interface SignatureLogo {
  blob: Blob;
  /** True when an admin has uploaded the organisation's logo, false for the bundled one. */
  custom: boolean;
}

let pending: Promise<SignatureLogo | null> | null = null;
const listeners = new Set<() => void>();

/**
 * The logo the server draws faded behind visible certificate signatures: the organisation's or
 * the bundled Stirling PDF one, or null when it cannot be fetched. Fetched once per session from
 * the backend that signs, though a failed fetch is retried on the next call;
 * {@link forgetSignatureLogo} makes the next call fetch again.
 */
export function getSignatureLogo(): Promise<SignatureLogo | null> {
  if (pending) return pending;
  const request: Promise<SignatureLogo | null> = apiClient
    .get<Blob>(LOGO_URL, {
      responseType: "blob",
      endpointName: "cert-sign",
      suppressErrorToast: true,
    })
    .then((response) => ({
      blob: response.data,
      custom: response.headers?.["x-signature-logo"] === "custom",
    }))
    .catch(() => {
      if (pending === request) pending = null;
      return null;
    });
  pending = request;
  return request;
}

export function forgetSignatureLogo(): void {
  pending = null;
  for (const listener of listeners) listener();
}

/** Called after {@link forgetSignatureLogo}; returns the unsubscribe function. */
export function onSignatureLogoChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
