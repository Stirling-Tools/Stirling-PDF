/**
 * Standardized error handling utilities for tool operations
 */

import { normalizeAxiosErrorData } from "@app/services/errorUtils";

/**
 * Default error extractor that follows the standard pattern
 */
export const extractErrorMessage = (error: any): string => {
  if (error.response?.data && typeof error.response.data === "string") {
    return error.response.data;
  }
  if (error.message) {
    return error.message;
  }
  return "There was an error processing your request.";
};

/**
 * Creates a standardized error handler for tool operations
 * @param fallbackMessage - Message to show when no specific error can be extracted
 * @returns Error handler function that follows the standard pattern
 */
export const createStandardErrorHandler = (fallbackMessage: string) => {
  return (error: any): string => {
    if (error.response?.data && typeof error.response.data === "string") {
      return error.response.data;
    }
    if (error.message) {
      return error.message;
    }
    return fallbackMessage;
  };
};

/**
 * Parses a 422 response, extracts errored file IDs from the payload (JSON or UUID regex),
 * and marks them in the UI. Returns true if IDs were found and handled, false otherwise.
 */
export const handle422Error = async (
  error: any,
  markFileError: (fileId: string) => void,
): Promise<boolean> => {
  const status = error?.response?.status;
  if (typeof status !== "number" || status !== 422) return false;

  const payload = error?.response?.data;
  let parsed: unknown = payload;

  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      parsed = payload;
    }
  } else if (payload && typeof (payload as Blob).text === "function") {
    const text = await (payload as Blob).text();
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  let ids: string[] | undefined = Array.isArray(
    (parsed as { errorFileIds?: unknown })?.errorFileIds,
  )
    ? (parsed as { errorFileIds: string[] }).errorFileIds
    : undefined;

  if (!ids && typeof parsed === "string") {
    const match = parsed.match(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    );
    if (match && match.length > 0) ids = Array.from(new Set(match));
  }

  if (ids && ids.length > 0) {
    for (const id of ids) {
      try {
        markFileError(id);
      } catch (_e) {
        void _e;
      }
    }
    return true;
  }

  return false;
};

/**
 * Handles password-related errors with status code checking
 * @param error - The error object from axios
 * @param incorrectPasswordMessage - Message to show for incorrect password (typically 500 status)
 * @param fallbackMessage - Message to show for other errors
 * @returns Error message string
 */
export const handlePasswordError = async (
  error: any,
  incorrectPasswordMessage: string,
  fallbackMessage: string,
): Promise<string> => {
  const status = error?.response?.status;

  // Handle specific error cases with user-friendly messages
  // Backend returns 400 with PdfPasswordException for incorrect/missing PDF passwords
  if (status === 500) {
    return incorrectPasswordMessage;
  }
  if (status === 400) {
    const data = error?.response?.data;
    // ProblemDetail JSON has type "/errors/pdf-password", blob needs parsing
    const isPasswordError = await (async () => {
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          return text.includes("pdf-password") || text.includes("passworded");
        } catch {
          return false;
        }
      }
      const type = data?.type ?? "";
      return type.includes("pdf-password");
    })();
    if (isPasswordError) {
      return incorrectPasswordMessage;
    }
  }

  // For other errors, try to extract the message
  const normalizedData = await normalizeAxiosErrorData(error?.response?.data);
  const errorWithNormalizedData = {
    ...error,
    response: {
      ...error?.response,
      data: normalizedData,
    },
  };
  return extractErrorMessage(errorWithNormalizedData) || fallbackMessage;
};
