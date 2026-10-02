import { invoke } from "@tauri-apps/api/core";
import { STIRLING_SAAS_URL, SUPABASE_KEY } from "@app/constants/connection";

/**
 * Signs in to a Stirling Cloud account and hands back its tokens without making
 * it the app's session: a self-hosted connection links a second account for
 * billing, and the app stays signed in to the server. Same Rust commands as the
 * app's own sign-in, which only return tokens; storing them is the caller's job.
 */
export interface CloudTokens {
  accessToken: string;
  refreshToken: string;
}

interface OAuthCallbackResult {
  access_token: string;
  refresh_token: string | null;
}

interface LoginResponse {
  token: string;
  refresh_token: string | null;
}

export class CloudSignInError extends Error {
  constructor(
    readonly reason: "credentials" | "timeout" | "unconfigured" | "failed",
    cause?: unknown,
  ) {
    super(`Stirling Cloud sign-in failed: ${reason}`, { cause });
    this.name = "CloudSignInError";
  }
}

function requireConfigured(): void {
  if (!STIRLING_SAAS_URL || !SUPABASE_KEY) {
    throw new CloudSignInError("unconfigured");
  }
}

// The commands reject with plain strings; these are the ones worth naming.
function classify(error: unknown): CloudSignInError {
  const message = String(
    error instanceof Error ? error.message : error,
  ).toLowerCase();
  if (message.includes("invalid username or password")) {
    return new CloudSignInError("credentials", error);
  }
  if (message.includes("timeout")) {
    return new CloudSignInError("timeout", error);
  }
  return new CloudSignInError("failed", error);
}

function tokens(access: string, refresh: string | null): CloudTokens {
  // Without one the billing session dies with the access token, within the hour.
  if (!refresh) throw new CloudSignInError("failed");
  return { accessToken: access, refreshToken: refresh };
}

/** Through the system browser, back to a loopback port the command listens on. */
export async function signInToCloudWithProvider(
  provider: string,
  successHtml: string,
  errorHtml: string,
): Promise<CloudTokens> {
  requireConfigured();
  let result: OAuthCallbackResult;
  try {
    result = await invoke<OAuthCallbackResult>("start_oauth_login", {
      provider,
      authServerUrl: STIRLING_SAAS_URL,
      supabaseKey: SUPABASE_KEY,
      successHtml,
      errorHtml,
    });
  } catch (error) {
    throw classify(error);
  }
  return tokens(result.access_token, result.refresh_token);
}

export async function signInToCloudWithPassword(
  email: string,
  password: string,
): Promise<CloudTokens> {
  requireConfigured();
  let result: LoginResponse;
  try {
    result = await invoke<LoginResponse>("login", {
      serverUrl: STIRLING_SAAS_URL,
      username: email,
      password,
      mfaCode: null,
      supabaseKey: SUPABASE_KEY,
      saasServerUrl: STIRLING_SAAS_URL,
    });
  } catch (error) {
    throw classify(error);
  }
  return tokens(result.token, result.refresh_token);
}
