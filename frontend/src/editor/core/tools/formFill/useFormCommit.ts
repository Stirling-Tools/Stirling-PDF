import { isAxiosError } from "axios";

/**
 * responseType "blob" means an error's ProblemDetail arrives as a Blob, so read
 * the body to surface which field the backend refused.
 */
export async function serverMessage(err: unknown): Promise<string | null> {
  if (!isAxiosError(err)) return null;
  const data: unknown = err.response?.data;
  try {
    const text = data instanceof Blob ? await data.text() : null;
    const parsed: unknown = text ? JSON.parse(text) : data;
    if (parsed && typeof parsed === "object") {
      const body = parsed as Record<string, unknown>;
      for (const key of ["detail", "message", "error", "title"]) {
        if (typeof body[key] === "string" && body[key]) return body[key];
      }
    }
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
