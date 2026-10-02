import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";

/** Desktop: Stirling Cloud's API in both editions; for a self-hosted server it
 *  is where the linked account's billing lives. */
export function saasApiBase(): string | null {
  return STIRLING_SAAS_BACKEND_API_URL
    ? STIRLING_SAAS_BACKEND_API_URL.replace(/\/+$/, "")
    : null;
}
