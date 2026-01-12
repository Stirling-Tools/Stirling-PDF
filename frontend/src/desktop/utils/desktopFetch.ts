import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * Desktop-specific fetch wrapper that handles certificate bypass for HTTPS requests.
 * This allows connections to servers with:
 * - Missing intermediate certificates
 * - Self-signed certificates
 * - Certificate hostname mismatches
 */
export async function desktopFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fetchOptions: any = { ...options };

  // Enable certificate bypass for HTTPS to handle cert issues
  if (url.startsWith('https://')) {
    fetchOptions.danger = {
      acceptInvalidCerts: true,
      acceptInvalidHostnames: true,
    };
  }

  return tauriFetch(url, fetchOptions);
}
