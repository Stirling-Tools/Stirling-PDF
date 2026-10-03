import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getHardwareSigningCapabilities,
  HardwareCertificateInfo,
  listPkcs11Certificates,
  Pkcs11LibraryInfo,
  listWindowsCertificates,
} from "@app/services/hardwareSigningService";

export const CUSTOM_LIBRARY_VALUE = "__custom__";

interface Options {
  /** Whether the Windows store is the source in play, rather than a PKCS#11 token. */
  isWindowsStore: boolean;
  /** The driver, PIN and slot a token needs; ignored for the Windows store. */
  pkcs11: { libraryPath?: string; pin?: string; slot?: number };
  /** Called when the store holds exactly one usable certificate and none is chosen yet. */
  onSoleCertificate: (alias: string) => void;
  /** Called when the platform turns out not to have a Windows store. */
  onWindowsStoreUnavailable: () => void;
  /** Called when a driver is detected and none was configured. */
  onDriverDetected: (path: string) => void;
}

/**
 * Loads the certificates this device can sign with.
 *
 * <p>Lives outside the settings panel because the panel shows the chosen certificate and the
 * dialog shows the list, and two components reading the store separately could disagree about
 * what is in it.
 */
export const useHardwareCertificates = ({
  isWindowsStore,
  pkcs11,
  onSoleCertificate,
  onWindowsStoreUnavailable,
  onDriverDetected,
}: Options) => {
  const { t } = useTranslation();

  const [certs, setCerts] = useState<HardwareCertificateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<Pkcs11LibraryInfo[]>([]);
  const [supported, setSupported] = useState({ windows: true, pkcs11: true });
  const [capsReady, setCapsReady] = useState(false);

  const clear = useCallback(() => {
    setCerts([]);
    setError(null);
  }, []);

  const applyCerts = useCallback(
    (loaded: HardwareCertificateInfo[]) => {
      setCerts(loaded);
      const usable = loaded.filter((c) => !c.expired && !c.notYetValid);
      if (usable.length === 1) {
        onSoleCertificate(usable[0].alias);
      }
    },
    [onSoleCertificate],
  );

  const reportFailure = useCallback((e: unknown, fallback: string) => {
    const err = e as {
      response?: { data?: { message?: string } };
      message?: string;
    };
    setError(err?.response?.data?.message || err?.message || fallback);
  }, []);

  // Which hardware kinds this machine supports, and the drivers it can see.
  useEffect(() => {
    let cancelled = false;
    getHardwareSigningCapabilities()
      .then((caps) => {
        if (cancelled) {
          return;
        }
        setSupported({
          windows: caps.windowsStoreSupported,
          pkcs11: caps.pkcs11Supported,
        });
        if (!caps.windowsStoreSupported) {
          onWindowsStoreUnavailable();
        }
        setCapsReady(true);
        setLibraries(caps.detectedLibraries);
        if (caps.detectedLibraries.length > 0) {
          onDriverDetected(caps.detectedLibraries[0].path);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        // Capabilities are best-effort; a driver path can still be typed by hand.
        setCapsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadWindowsCerts = useCallback(() => {
    setLoading(true);
    setError(null);
    listWindowsCertificates()
      .then(applyCerts)
      .catch((e) =>
        reportFailure(
          e,
          t(
            "certSign.hardware.windowsLoadError",
            "Could not read the Windows certificate store",
          ),
        ),
      )
      .finally(() => setLoading(false));
  }, [applyCerts, reportFailure, t]);

  const loadPkcs11Certs = useCallback(() => {
    if (!pkcs11.libraryPath || !pkcs11.pin) {
      return;
    }
    setLoading(true);
    setError(null);
    listPkcs11Certificates({
      libraryPath: pkcs11.libraryPath,
      slot: pkcs11.slot,
      pin: pkcs11.pin,
    })
      .then(applyCerts)
      .catch((e) =>
        reportFailure(
          e,
          t(
            "certSign.hardware.pkcs11LoadError",
            "Could not read certificates from the token. Check the PIN and driver.",
          ),
        ),
      )
      .finally(() => setLoading(false));
  }, [
    applyCerts,
    pkcs11.libraryPath,
    pkcs11.pin,
    pkcs11.slot,
    reportFailure,
    t,
  ]);

  // Windows store certificates enumerate without a PIN, so load them eagerly - but only once
  // capabilities confirm the store exists, to avoid a doomed call on mac and Linux.
  useEffect(() => {
    if (capsReady && isWindowsStore && supported.windows) {
      loadWindowsCerts();
    }
  }, [isWindowsStore, supported.windows, capsReady]);

  return {
    certs,
    loading,
    error,
    libraries,
    supported,
    capsReady,
    clear,
    loadWindowsCerts,
    loadPkcs11Certs,
  };
};
