import axios from "axios";
import { createClient } from "@supabase/supabase-js";

/** Ceremony clients stay outside the app session until the server has admitted the company login. */
export const companyAuth = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  {
    auth: {
      storageKey: "company-sso-session",
      storage: sessionStorage,
      flowType: "pkce",
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
export const originalAuth = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  {
    auth: {
      storageKey: "company-original-session",
      storage: sessionStorage,
      flowType: "pkce",
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

let pendingExchange:
  | {
      code: string;
      proof: string | null;
      result: ReturnType<typeof companyAuth.auth.exchangeCodeForSession>;
    }
  | undefined;

/** React may mount a callback twice; an authorization code must only be exchanged once. */
export function exchangeCompanyCode(code: string, proof: string | null) {
  if (pendingExchange?.code === code && pendingExchange.proof === proof)
    return pendingExchange.result;
  const result = (
    proof === "original" ? originalAuth : companyAuth
  ).auth.exchangeCodeForSession(code);
  pendingExchange = { code, proof, result };
  return result;
}

export interface CompanySsoSettings {
  eligible: boolean;
  connectionId: string | null;
  active: boolean;
  tested: boolean;
  connectedUserIds: number[];
  entityId: string;
  acsUrl: string;
}

/** Uses explicit credentials, so the app's normal refresh and redirect interceptors cannot interfere. */
export async function companySsoRequest<T>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const response = await axios.request<T>({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    url: `/api/v1/company-sso/${path}`,
    method: body === undefined ? "GET" : "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: body,
  });
  return response.data;
}

export function companySsoError(error: unknown): string {
  if (
    axios.isAxiosError<{ message?: string }>(error) &&
    error.response?.data.message
  )
    return error.response.data.message;
  return error instanceof Error
    ? error.message
    : "Company sign-in could not be completed. Try again.";
}
