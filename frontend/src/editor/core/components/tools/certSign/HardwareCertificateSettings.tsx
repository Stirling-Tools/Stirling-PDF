import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Group,
  Loader,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import DigitalIdList, {
  isUsableDigitalId,
} from "@editor/components/tools/certSign/DigitalIdList";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import {
  getHardwareSigningCapabilities,
  HardwareCertificateInfo,
  listMacKeychainCertificates,
  listPkcs11Certificates,
  listWindowsCertificates,
  Pkcs11LibraryInfo,
} from "@editor/services/hardwareSigningService";
import { serverErrorReason } from "@editor/services/errorUtils";

interface HardwareCertificateSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
  onChosenCertificateChange?: (cert: HardwareCertificateInfo | null) => void;
}

const CUSTOM_LIBRARY_VALUE = "__custom__";

type OsStoreKind = "WINDOWS_STORE" | "MACOS_KEYCHAIN";

const HardwareCertificateSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  onChosenCertificateChange,
}: HardwareCertificateSettingsProps) => {
  const { t } = useTranslation();
  const isOsStore =
    parameters.certType === "WINDOWS_STORE" ||
    parameters.certType === "MACOS_KEYCHAIN";

  const [certs, setCerts] = useState<HardwareCertificateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [pkcs11Loaded, setPkcs11Loaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [libraries, setLibraries] = useState<Pkcs11LibraryInfo[]>([]);
  const [librarySelection, setLibrarySelection] = useState<string>("");
  const [customLibrary, setCustomLibrary] = useState<string>("");
  const [supported, setSupported] = useState({
    windows: true,
    mac: false,
    pkcs11: true,
  });
  const osStoreKind: OsStoreKind | null = supported.windows
    ? "WINDOWS_STORE"
    : supported.mac
      ? "MACOS_KEYCHAIN"
      : null;
  const [capsReady, setCapsReady] = useState(false);
  const [capsFailed, setCapsFailed] = useState(false);
  const [capsAttempt, setCapsAttempt] = useState(0);

  const selectKind = (kind: OsStoreKind | "PKCS11") => {
    if (parameters.certType === kind) {
      return;
    }
    onParameterChange("certType", kind);
    onParameterChange("alias", undefined);
    if (parameters.certType === "PKCS11") {
      onParameterChange("password", "");
    }
    setCerts([]);
    setPkcs11Loaded(false);
    setError(null);
  };

  const applyCerts = useCallback(
    (loaded: HardwareCertificateInfo[]) => {
      setCerts(loaded);
      const usable = loaded.filter(isUsableDigitalId);
      const stillThere = usable.some((c) => c.alias === parameters.alias);
      if (usable.length === 1 && !stillThere) {
        onParameterChange("alias", usable[0].alias);
      } else if (parameters.alias && !stillThere) {
        onParameterChange("alias", undefined);
      }
    },
    [onParameterChange, parameters.alias],
  );

  // Load capabilities once: which hardware kinds are supported and the detected
  // PKCS#11 driver libraries.
  useEffect(() => {
    let cancelled = false;
    setCapsFailed(false);
    getHardwareSigningCapabilities()
      .then((caps) => {
        if (cancelled) {
          return;
        }
        setSupported({
          windows: caps.windowsStoreSupported,
          mac: caps.macKeychainSupported,
          pkcs11: caps.pkcs11Supported,
        });
        // Swap an OS-store choice for this platform's store, or the PKCS#11 path on Linux.
        const platformStore: OsStoreKind | null = caps.windowsStoreSupported
          ? "WINDOWS_STORE"
          : caps.macKeychainSupported
            ? "MACOS_KEYCHAIN"
            : null;
        if (
          (parameters.certType === "WINDOWS_STORE" ||
            parameters.certType === "MACOS_KEYCHAIN") &&
          parameters.certType !== platformStore
        ) {
          onParameterChange("certType", platformStore ?? "PKCS11");
          onParameterChange("alias", undefined);
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
        // Keep the user's choice: a failed check (the backend still starting, say) says
        // nothing about which stores exist, so offer a retry rather than switch paths.
        if (!cancelled) setCapsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [capsAttempt]);

  // What the user reviewed, so signing refuses another certificate or a copy of this one
  // that is no longer on their security key.
  const chosen = certs.find((cert) => cert.alias === parameters.alias);
  const chosenSha256 = chosen?.sha256;
  const chosenOnToken = chosen?.onToken === true;
  useEffect(() => {
    onChosenCertificateChange?.(chosen ?? null);
  }, [chosen, onChosenCertificateChange]);
  // A refresh after the key is unplugged can list the login-keychain copy under the same alias;
  // the token requirement stays with the selection until the user picks something else.
  const tokenRequiredFor = useRef(parameters.alias);
  useEffect(() => {
    if (parameters.expectedCertificateSha256 !== chosenSha256) {
      onParameterChange("expectedCertificateSha256", chosenSha256);
    }
    const sameSelection = tokenRequiredFor.current === parameters.alias;
    tokenRequiredFor.current = parameters.alias;
    const required =
      chosenOnToken || (sameSelection && Boolean(parameters.requireToken));
    if (Boolean(parameters.requireToken) !== required) {
      onParameterChange("requireToken", required || undefined);
    }
  }, [
    chosenSha256,
    chosenOnToken,
    parameters.alias,
    parameters.expectedCertificateSha256,
    parameters.requireToken,
    onParameterChange,
  ]);

  const loadOsStoreCerts = useCallback(() => {
    setLoading(true);
    setError(null);
    const list =
      osStoreKind === "MACOS_KEYCHAIN"
        ? listMacKeychainCertificates
        : listWindowsCertificates;
    list()
      .then(applyCerts)
      .catch(async (e) => {
        setError(
          (await serverErrorReason(e)) ||
            (osStoreKind === "MACOS_KEYCHAIN"
              ? t(
                  "certSign.hardware.macLoadError",
                  "Could not read the macOS keychain",
                )
              : t(
                  "certSign.hardware.windowsLoadError",
                  "Could not read the Windows certificate store",
                )),
        );
      })
      .finally(() => setLoading(false));
  }, [applyCerts, osStoreKind, t]);

  // OS store certificates can be enumerated without a PIN, so load eagerly -
  // but only once capabilities confirm which store this platform has.
  useEffect(() => {
    if (capsReady && isOsStore && osStoreKind === parameters.certType) {
      loadOsStoreCerts();
    }
  }, [isOsStore, osStoreKind, parameters.certType, capsReady]);

  // A list read with another slot, driver or PIN may not be this card's.
  const forgetPkcs11Certs = () => {
    setCerts([]);
    setPkcs11Loaded(false);
    onParameterChange("alias", undefined);
  };

  const onLibraryChange = (value: string | null) => {
    const selection = value ?? "";
    setLibrarySelection(selection);
    forgetPkcs11Certs();
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
    setPkcs11Loaded(false);
    listPkcs11Certificates({
      libraryPath: parameters.pkcs11LibraryPath,
      slot: parameters.pkcs11Slot,
      pin: parameters.password,
    })
      .then((loaded) => {
        applyCerts(loaded);
        setPkcs11Loaded(true);
      })
      .catch(async (e) => {
        applyCerts([]);
        setError(
          (await serverErrorReason(e)) ||
            t(
              "certSign.hardware.pkcs11LoadError",
              "Could not read the card. Check the PIN and card software.",
            ),
        );
      })
      .finally(() => setLoading(false));
  }, [
    applyCerts,
    parameters.password,
    parameters.pkcs11LibraryPath,
    parameters.pkcs11Slot,
    t,
  ]);

  const idList = (onRefresh?: () => void) => (
    <DigitalIdList
      certs={certs}
      selectedAlias={parameters.alias}
      onSelect={(alias) => onParameterChange("alias", alias)}
      loading={loading}
      disabled={disabled || loading}
      onRefresh={onRefresh}
    />
  );

  const errorAlert = error && (
    <Alert color="red" variant="light" role="alert">
      {error}
    </Alert>
  );

  const libraryOptions = [
    // Label = driver name only; the long path goes under the dropdown so the
    // input doesn't overflow / scroll horizontally.
    ...libraries.map((l) => ({
      value: l.path,
      label: l.name,
    })),
    {
      value: CUSTOM_LIBRARY_VALUE,
      label: t("certSign.hardware.customLibrary", "Other location…"),
    },
  ];
  const selectedLibraryPath =
    librarySelection && librarySelection !== CUSTOM_LIBRARY_VALUE
      ? librarySelection
      : null;

  if (capsFailed) {
    return (
      <Stack gap="sm">
        <Alert color="red" variant="light" role="alert">
          {t(
            "certSign.hardware.capabilitiesError",
            "Could not check which digital IDs this device can use.",
          )}
        </Alert>
        <Button
          variant="secondary"
          onClick={() => setCapsAttempt((attempt) => attempt + 1)}
          disabled={disabled}
        >
          {t("certSign.hardware.retry", "Try again")}
        </Button>
      </Stack>
    );
  }

  // Hold the UI until capabilities are known, so the OS-store picker doesn't render
  // and then vanish on Linux (no flicker).
  if (!capsReady) {
    return (
      <Stack gap="md" align="center" py="sm">
        <Loader size="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {isOsStore ? (
        <>
          <Text size="sm" c="dimmed">
            {t(
              "certSign.hardware.osStoreHint",
              "Insert your smart card or security key, then choose your digital ID.",
            )}
          </Text>
          {errorAlert}
          {idList(loadOsStoreCerts)}
          {supported.pkcs11 && (
            <Text size="xs" c="dimmed">
              {t("certSign.hardware.notListed", "Don't see your ID?")}{" "}
              <Anchor
                component="button"
                type="button"
                size="xs"
                c="dimmed"
                underline="always"
                className="digital-id-link"
                onClick={() => selectKind("PKCS11")}
                disabled={disabled || loading}
              >
                {t("certSign.hardware.useDriver", "Read the card directly")}
              </Anchor>
            </Text>
          )}
        </>
      ) : (
        <>
          <Group gap={4} wrap="nowrap">
            {osStoreKind && (
              <ActionIcon
                variant="quiet"
                size="sm"
                aria-label={t(
                  "certSign.hardware.backToDigitalIds",
                  "Back to digital IDs",
                )}
                title={t(
                  "certSign.hardware.backToDigitalIds",
                  "Back to digital IDs",
                )}
                onClick={() => selectKind(osStoreKind)}
                disabled={disabled || loading}
              >
                <Icon name="chevron-left" size={16} />
              </ActionIcon>
            )}
            <Text size="sm" fw={500}>
              {t("certSign.hardware.driverSetup", "Read card directly")}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {t(
              "certSign.hardware.pkcs11Hint",
              "For cards your computer doesn't list. Choose the software that came with your card and enter its PIN.",
            )}
          </Text>
          {libraries.length === 0 && (
            <Alert color="yellow" variant="light">
              {t(
                "certSign.hardware.noDriver",
                "No card software was detected. Install the software that came with your card, then reopen this - or enter its path below.",
              )}
            </Alert>
          )}
          <Select
            label={t("certSign.hardware.driver", "Card software (PKCS#11)")}
            placeholder={t(
              "certSign.hardware.selectDriver",
              "Select card software",
            )}
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
              label={t("certSign.hardware.driverPath", "Card software path")}
              placeholder={t(
                "certSign.hardware.driverPathPlaceholder",
                "Full path to the PKCS#11 library (.dll, .so or .dylib)",
              )}
              value={customLibrary}
              onChange={(e) => {
                setCustomLibrary(e.currentTarget.value);
                forgetPkcs11Certs();
                onParameterChange("pkcs11LibraryPath", e.currentTarget.value);
              }}
              disabled={disabled || loading}
            />
          )}
          <Group gap="xs" grow align="flex-start">
            <PasswordInput
              label={t("certSign.hardware.pin", "PIN")}
              value={parameters.password}
              onChange={(e) => {
                forgetPkcs11Certs();
                onParameterChange("password", e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadPkcs11Certs();
              }}
              disabled={disabled || loading}
            />
            <NumberInput
              label={t("certSign.hardware.slot", "Slot (optional)")}
              value={parameters.pkcs11Slot ?? ""}
              onChange={(v) => {
                forgetPkcs11Certs();
                onParameterChange(
                  "pkcs11Slot",
                  v === "" || v == null ? undefined : Number(v),
                );
              }}
              min={0}
              disabled={disabled || loading}
            />
          </Group>
          <Button
            variant="secondary"
            onClick={loadPkcs11Certs}
            loading={loading}
            disabled={
              disabled ||
              loading ||
              !parameters.pkcs11LibraryPath ||
              !parameters.password
            }
          >
            {t("certSign.hardware.listCerts", "Show digital IDs")}
          </Button>
          {errorAlert}
          {pkcs11Loaded && idList()}
        </>
      )}
    </Stack>
  );
};

export default HardwareCertificateSettings;
