import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@app/constants/app";
import { buildMobileRouteUrl } from "@app/utils/mobileScannerUrl";
import apiClient from "@app/services/apiClient";

/**
 * Session lifecycle for phone-to-desktop transfer over the mobile-scanner
 * backend (`/api/v1/mobile-scanner/*`): one temporary session, a QR-encodable
 * URL for the phone, polling for uploads, and cleanup.
 *
 * Consumers decide what a received file means — the scanner converts images to
 * PDF, the signature flow treats them as ink — so files are delivered raw, one
 * at a time, via `onFileReceived`.
 */

interface MobileScannerFile {
  filename: string;
  contentType?: string;
}

// Generate a cryptographically secure UUID v4-like session ID
function generateSessionId(): string {
  // Use Web Crypto API for cryptographically secure random values
  const cryptoObj = typeof crypto !== "undefined" ? crypto : window.crypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);

    // Set version (4) and variant bits per RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    // Convert bytes to hex string in UUID format
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  // If Web Crypto is not available, fail fast rather than using insecure randomness
  throw new Error(
    "Web Crypto API not available. Cannot generate secure session ID.",
  );
}

export interface MobileTransferSessionInfo {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  timeoutMs: number;
}

interface UseMobileTransferSessionParams {
  /** Session exists and polling runs only while true (modal open). */
  active: boolean;
  /** SPA route the phone opens, without slashes: "mobile-scanner", "mobile-sign". */
  routePath: string;
  /** Called once per newly uploaded file, in upload order. */
  onFileReceived: (file: File) => void | Promise<void>;
  /** Message shown when the backend refuses to create a session. */
  sessionCreateErrorMessage: string;
  /** Message shown when polling for uploads fails. */
  pollingErrorMessage: string;
  /** Host the phone should reach, when configured (server_url / frontendUrl). */
  configuredUrl?: string;
}

export function useMobileTransferSession({
  active,
  routePath,
  onFileReceived,
  sessionCreateErrorMessage,
  pollingErrorMessage,
  configuredUrl,
}: UseMobileTransferSessionParams) {
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [sessionInfo, setSessionInfo] =
    useState<MobileTransferSessionInfo | null>(null);
  const [filesReceived, setFilesReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const processedFiles = useRef<Set<string>>(new Set());

  // The QR-code URL the phone opens. It must land on the public route under
  // the app's base path, otherwise the phone hits the auth-gated catch-all
  // route and is bounced to the login page.
  const mobileUrl = buildMobileRouteUrl({
    configuredUrl: configuredUrl ?? "",
    sessionId,
    origin: window.location.origin,
    basePath: BASE_PATH,
    routePath,
  });

  const createSession = useCallback(
    async (newSessionId: string) => {
      try {
        const response = await apiClient.post<MobileTransferSessionInfo>(
          `/api/v1/mobile-scanner/create-session/${newSessionId}`,
          undefined,
          { responseType: "json" },
        );

        if (!response.status || response.status !== 200) {
          throw new Error("Failed to create session");
        }

        setSessionInfo(response.data);
        setError(null);
      } catch (err) {
        console.error("[useMobileTransferSession] create failed:", err);
        setError(sessionCreateErrorMessage);
      }
    },
    [sessionCreateErrorMessage],
  );

  // Regenerate session (when expired or warned)
  const regenerateSession = useCallback(() => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setShowExpiryWarning(false);
    setFilesReceived(0);
    processedFiles.current.clear();
    createSession(newSessionId);
  }, [createSession]);

  const pollForFiles = useCallback(async () => {
    if (!active) return;

    try {
      const response = await apiClient.get(
        `/api/v1/mobile-scanner/files/${sessionId}`,
      );
      if (!response.status || response.status !== 200) {
        throw new Error("Failed to check for files");
      }

      const files = response.data.files || [];

      // Download only files we haven't processed yet
      const newFiles = files.filter(
        (f: MobileScannerFile) => !processedFiles.current.has(f.filename),
      );
      if (newFiles.length === 0) return;

      for (const fileMetadata of newFiles) {
        try {
          const downloadResponse = await apiClient.get(
            `/api/v1/mobile-scanner/download/${sessionId}/${fileMetadata.filename}`,
            { responseType: "blob" },
          );

          if (downloadResponse.status === 200) {
            const file = new File(
              [downloadResponse.data],
              fileMetadata.filename,
              { type: fileMetadata.contentType || "image/jpeg" },
            );
            processedFiles.current.add(fileMetadata.filename);
            setFilesReceived((prev) => prev + 1);
            await onFileReceived(file);
          }
        } catch (err) {
          console.error(
            "[useMobileTransferSession] download failed:",
            fileMetadata.filename,
            err,
          );
        }
      }

      // Delete the entire session immediately after downloading, so uploads
      // sit on the server only for the seconds between polls.
      try {
        await apiClient.delete(`/api/v1/mobile-scanner/session/${sessionId}`);
      } catch (cleanupErr) {
        console.warn(
          "[useMobileTransferSession] post-download cleanup failed:",
          cleanupErr,
        );
      }
    } catch (err) {
      console.error("[useMobileTransferSession] polling failed:", err);
      setError(pollingErrorMessage);
    }
  }, [active, sessionId, onFileReceived, pollingErrorMessage]);

  // Create the session while active; delete it when deactivated/unmounted.
  useEffect(() => {
    if (!active) return;

    createSession(sessionId);
    setFilesReceived(0);
    setError(null);
    setShowExpiryWarning(false);
    processedFiles.current.clear();

    return () => {
      apiClient
        .delete(`/api/v1/mobile-scanner/session/${sessionId}`)
        .catch((err) =>
          console.warn("[useMobileTransferSession] cleanup failed:", err),
        );
    };
  }, [active, sessionId, createSession]);

  // Poll for uploads while the session is live
  useEffect(() => {
    if (active && sessionInfo) {
      pollIntervalRef.current = window.setInterval(pollForFiles, 2000);
      pollForFiles();
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [active, sessionInfo, pollForFiles]);

  // Session timeout timer: warn under a minute, regenerate on expiry
  useEffect(() => {
    if (!active || !sessionInfo) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = sessionInfo.expiresAt - now;

      if (remaining <= 0) {
        setShowExpiryWarning(false);
        regenerateSession();
      } else if (remaining <= 60000 && !showExpiryWarning) {
        setShowExpiryWarning(true);
      }

      setTimeRemaining(Math.max(0, remaining));
    };

    updateTimer();
    timerIntervalRef.current = window.setInterval(updateTimer, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [active, sessionInfo, showExpiryWarning, regenerateSession]);

  return {
    /** URL to encode in the QR code. */
    mobileUrl,
    sessionInfo,
    /** Count of files received this session (resets on regenerate). */
    filesReceived,
    error,
    /** Milliseconds until the session expires, once known. */
    timeRemaining,
    /** True inside the final minute before expiry. */
    showExpiryWarning,
    regenerateSession,
  };
}
