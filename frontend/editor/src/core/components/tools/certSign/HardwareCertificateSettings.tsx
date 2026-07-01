import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import {
  getHardwareSigningCapabilities,
  HardwareCertificateInfo,
  listPkcs11Certificates,
  listWindowsCertificates,
  Pkcs11LibraryInfo,
} from "@app/services/hardwareSigningService";

interface HardwareCertificateSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const CUSTOM_LIBRARY_VALUE = "__custom__";

const HardwareCertificateSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: HardwareCertificateSettingsProps) => {
  const { t } = useTranslation();
  const isWindowsStore = parameters.certType === "WINDOWS_STORE";

  const [certs, setCerts] = useState<HardwareCertificateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [libraries, setLibraries] = useState<Pkcs11LibraryInfo[]>([]);
  const [librarySelection, setLibrarySelection] = useState<string>("");
  const [customLibrary, setCustomLibrary] = useState<string>("");
  const [supported, setSupported] = useState({ windows: true, pkcs11: true });
  const [capsReady, setCapsReady] = useState(false);

  const selectKind = (kind: "WINDOWS_STORE" | "PKCS11") => {
    if (parameters.certType === kind) {
      return;
    }
    onParameterChange("certType", kind);
    onParameterChange("alias", undefined);
    setCerts([]);
    setError(null);
  };

  // A GUID-only name (e.g. Microsoft device certs) is unreadable; prefer a real name.
  const isGuidish = (s?: string | null) =>
    !s ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      s.trim(),
    );

  // Best human-readable name: the Windows friendly name (alias) beats a GUID subject CN.
  const displayName = (cert: HardwareCertificateInfo): string => {
    if (cert.subjectCommonName && !isGuidish(cert.subjectCommonName)) {
      return cert.subjectCommonName;
    }
    if (cert.alias && !isGuidish(cert.alias)) {
      return cert.alias;
    }
    return cert.subjectCommonName || cert.alias;
  };

  const isUsable = (cert: HardwareCertificateInfo) =>
    !cert.expired && !cert.notYetValid;

  // Build a readable label for a certificate option.
  const certLabel = useCallback(
    (cert: HardwareCertificateInfo): string => {
      const name = displayName(cert);
      // Omit the issuer when it's the same as the name (self-signed) - avoids "X · X".
      const showIssuer =
        cert.issuerCommonName &&
        cert.issuerCommonName !== cert.subjectCommonName &&
        cert.issuerCommonName !== name;
      const issuer = showIssuer ? ` · ${cert.issuerCommonName}` : "";
      let suffix = "";
      if (cert.expired) {
        suffix = ` (${t("certSign.hardware.expired", "expired")})`;
      } else if (cert.notYetValid) {
        suffix = ` (${t("certSign.hardware.notYetValid", "not yet valid")})`;
      } else if (cert.notAfter) {
        const date = cert.notAfter.slice(0, 10);
        suffix = ` (${t("certSign.hardware.expires", "expires")} ${date})`;
      }
      return `${name}${issuer}${suffix}`;
    },
    [t],
  );

  // Rank: usable + readable first, system/GUID certs next, expired/not-yet-valid last.
  const rank = (cert: HardwareCertificateInfo): number => {
    if (!isUsable(cert)) return 3;
    if (isGuidish(cert.subjectCommonName) && isGuidish(cert.alias)) return 2;
    return 0;
  };

  const applyCerts = useCallback(
    (loaded: HardwareCertificateInfo[]) => {
      setCerts(loaded);
      // Auto-select when there is exactly one usable certificate.
      const usable = loaded.filter((c) => !c.expired && !c.notYetValid);
      if (usable.length === 1 && !parameters.alias) {
        onParameterChange("alias", usable[0].alias);
      }
    },
    [onParameterChange, parameters.alias],
  );

  // Load capabilities once: which hardware kinds are supported and the detected
  // PKCS#11 driver libraries.
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
        // Non-Windows (mac/Linux) has no Windows store; default the device to the USB-token path.
        if (
          !caps.windowsStoreSupported &&
          parameters.certType === "WINDOWS_STORE"
        ) {
          onParameterChange("certType", "PKCS11");
        }
        setCapsReady(true);
        setLibraries(caps.detectedLibraries);
        // Pre-select a detected library, or the one already chosen.
        if (parameters.pkcs11LibraryPath) {
          const match = caps.detectedLibraries.find(
            (l) => l.path === parameters.pkcs11LibraryPath,
          );
          setLibrarySelection(match ? match.path : CUSTOM_LIBRARY_VALUE);
          if (!match) {
            setCustomLibrary(parameters.pkcs11LibraryPath);
          }
        } else if (caps.detectedLibraries.length > 0) {
          setLibrarySelection(caps.detectedLibraries[0].path);
          onParameterChange(
            "pkcs11LibraryPath",
            caps.detectedLibraries[0].path,
          );
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        /* capabilities are best-effort; the user can still type a path */
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
      .catch((e: any) =>
        setError(
          e?.response?.data?.message ||
            e?.message ||
            t(
              "certSign.hardware.windowsLoadError",
              "Could not read the Windows certificate store",
            ),
        ),
      )
      .finally(() => setLoading(false));
  }, [applyCerts, t]);

  // Windows store certificates can be enumerated without a PIN, so load eagerly -
  // but only once capabilities confirm the store exists (avoids a spurious call on mac/Linux).
  useEffect(() => {
    if (capsReady && isWindowsStore && supported.windows) {
      loadWindowsCerts();
    }
  }, [isWindowsStore, supported.windows, capsReady]);

  const onLibraryChange = (value: string | null) => {
    const selection = value ?? "";
    setLibrarySelection(selection);
    setCerts([]);
    onParameterChange("alias", undefined);
    if (selection === CUSTOM_LIBRARY_VALUE) {
      onParameterChange("pkcs11LibraryPath", customLibrary || "");
    } else {
      onParameterChange("pkcs11LibraryPath", selection);
    }
  };

  const loadPkcs11Certs = useCallback(() => {
    if (!parameters.pkcs11LibraryPath || !parameters.password) {
      return;
    }
    setLoading(true);
    setError(null);
    listPkcs11Certificates({
      libraryPath: parameters.pkcs11LibraryPath,
      slot: parameters.pkcs11Slot,
      pin: parameters.password,
    })
      .then(applyCerts)
      .catch((e: any) =>
        setError(
          e?.response?.data?.message ||
            e?.message ||
            t(
              "certSign.hardware.pkcs11LoadError",
              "Could not read certificates from the token. Check the PIN and driver.",
            ),
        ),
      )
      .finally(() => setLoading(false));
  }, [
    applyCerts,
    parameters.password,
    parameters.pkcs11LibraryPath,
    parameters.pkcs11Slot,
    t,
  ]);

  const certOptions = [...certs]
    .sort(
      (a, b) =>
        rank(a) - rank(b) || displayName(a).localeCompare(displayName(b)),
    )
    .map((cert) => ({
      value: cert.alias,
      label: certLabel(cert),
      // Expired / not-yet-valid certs can't produce a valid signature - show but block.
      disabled: !isUsable(cert),
    }));

  const libraryOptions = [
    // Label = driver name only; the long path goes under the dropdown so the
    // input doesn't overflow / scroll horizontally.
    ...libraries.map((l) => ({
      value: l.path,
      label: l.name,
    })),
    {
      value: CUSTOM_LIBRARY_VALUE,
      label: t("certSign.hardware.customLibrary", "Custom driver path…"),
    },
  ];
  const selectedLibraryPath =
    librarySelection && librarySelection !== CUSTOM_LIBRARY_VALUE
      ? librarySelection
      : null;

  // Hold the UI until capabilities are known, so the kind toggle / Windows-store
  // section don't render and then vanish on mac/Linux (no flicker).
  if (!capsReady) {
    return (
      <Stack gap="md" align="center" py="sm">
        <Loader size="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {supported.windows && supported.pkcs11 && (
        <div style={{ display: "flex", gap: "4px" }}>
          <Button
            variant={isWindowsStore ? "filled" : "outline"}
            color={isWindowsStore ? "teal" : "var(--text-muted)"}
            onClick={() => selectKind("WINDOWS_STORE")}
            disabled={disabled || loading}
            style={{ flex: 1, fontSize: "11px", minHeight: 40, height: "auto" }}
            styles={{ label: { whiteSpace: "normal", lineHeight: 1.15 } }}
          >
            {t("certSign.format.windowsStore", "Windows certificate store")}
          </Button>
          <Button
            variant={!isWindowsStore ? "filled" : "outline"}
            color={!isWindowsStore ? "teal" : "var(--text-muted)"}
            onClick={() => selectKind("PKCS11")}
            disabled={disabled || loading}
            style={{ flex: 1, fontSize: "11px", minHeight: 40, height: "auto" }}
            styles={{ label: { whiteSpace: "normal", lineHeight: 1.15 } }}
          >
            {t("certSign.format.pkcs11", "USB Token")}
          </Button>
        </div>
      )}
      {isWindowsStore ? (
        <>
          <Text size="sm" c="dimmed">
            {t(
              "certSign.hardware.windowsHint",
              "Pick a certificate from your Windows store. Signing uses the key on your card/token - Windows will prompt for the PIN.",
            )}
          </Text>
          <Group gap="xs" align="flex-end">
            <Select
              style={{ flex: 1 }}
              label={t("certSign.hardware.certificate", "Certificate")}
              placeholder={t(
                "certSign.hardware.selectCert",
                "Select certificate",
              )}
              data={certOptions}
              value={parameters.alias ?? null}
              onChange={(v) => onParameterChange("alias", v ?? undefined)}
              disabled={disabled || loading}
              searchable
              nothingFoundMessage={t(
                "certSign.hardware.noCerts",
                "No signing certificates found",
              )}
            />
            <Button
              variant="default"
              onClick={loadWindowsCerts}
              disabled={disabled || loading}
            >
              {t("certSign.hardware.refresh", "Refresh")}
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            {t(
              "certSign.hardware.pkcs11Hint",
              "Select your token's PKCS#11 driver, enter the PIN, then list the certificates on the token.",
            )}
          </Text>
          {libraries.length === 0 && (
            <Alert color="yellow" variant="light">
              {t(
                "certSign.hardware.noDriver",
                "No PKCS#11 driver was detected. Install your token's driver (e.g. OpenSC), then reopen this - or enter the driver path manually below.",
              )}
            </Alert>
          )}
          <Select
            label={t("certSign.hardware.driver", "PKCS#11 driver")}
            placeholder={t("certSign.hardware.selectDriver", "Select driver")}
            data={libraryOptions}
            value={librarySelection || null}
            onChange={onLibraryChange}
            disabled={disabled || loading}
          />
          {selectedLibraryPath && (
            <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
              {selectedLibraryPath}
            </Text>
          )}
          {librarySelection === CUSTOM_LIBRARY_VALUE && (
            <TextInput
              label={t("certSign.hardware.driverPath", "Driver library path")}
              placeholder={t(
                "certSign.hardware.driverPathPlaceholder",
                "Full path to your PKCS#11 driver (.dll, .so or .dylib)",
              )}
              value={customLibrary}
              onChange={(e) => {
                setCustomLibrary(e.currentTarget.value);
                onParameterChange("pkcs11LibraryPath", e.currentTarget.value);
              }}
              disabled={disabled || loading}
            />
          )}
          <Group gap="xs" grow>
            <TextInput
              label={t("certSign.hardware.pin", "Token PIN")}
              type="password"
              value={parameters.password}
              onChange={(e) =>
                onParameterChange("password", e.currentTarget.value)
              }
              disabled={disabled || loading}
            />
            <NumberInput
              label={t("certSign.hardware.slot", "Slot (optional)")}
              value={parameters.pkcs11Slot ?? ""}
              onChange={(v) =>
                onParameterChange(
                  "pkcs11Slot",
                  v === "" || v == null ? undefined : Number(v),
                )
              }
              min={0}
              disabled={disabled || loading}
            />
          </Group>
          <Button
            variant="default"
            onClick={loadPkcs11Certs}
            disabled={
              disabled ||
              loading ||
              !parameters.pkcs11LibraryPath ||
              !parameters.password
            }
          >
            {t("certSign.hardware.listCerts", "List certificates")}
          </Button>
          {certs.length > 0 && (
            <Select
              label={t("certSign.hardware.certificate", "Certificate")}
              placeholder={t(
                "certSign.hardware.selectCert",
                "Select certificate",
              )}
              data={certOptions}
              value={parameters.alias ?? null}
              onChange={(v) => onParameterChange("alias", v ?? undefined)}
              disabled={disabled || loading}
              searchable
            />
          )}
        </>
      )}

      {loading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {t("certSign.hardware.loading", "Reading certificates…")}
          </Text>
        </Group>
      )}
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
    </Stack>
  );
};

export default HardwareCertificateSettings;
