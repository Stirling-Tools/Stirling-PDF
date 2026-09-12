import { useCallback, useState } from "react";
import {
  Alert,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import {
  CUSTOM_LIBRARY_VALUE,
  useHardwareCertificates,
} from "@app/hooks/tools/certSign/useHardwareCertificates";
import { HardwareCertificateInfo } from "@app/services/hardwareSigningService";
import {
  displayName,
  distinctIssuer,
  expiryDate,
  validityOf,
} from "@app/utils/certSign/hardwareCertificateDisplay";
import HardwareCertificateModal from "@app/components/tools/certSign/modals/HardwareCertificateModal";

interface HardwareCertificateSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const HardwareCertificateSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: HardwareCertificateSettingsProps) => {
  const { t } = useTranslation();
  const isWindowsStore = parameters.certType === "WINDOWS_STORE";

  const [librarySelection, setLibrarySelection] = useState<string>("");
  const [customLibrary, setCustomLibrary] = useState<string>("");
  const [picking, setPicking] = useState(false);

  const onSoleCertificate = useCallback(
    (alias: string) => {
      if (!parameters.alias) {
        onParameterChange("alias", alias);
      }
    },
    [onParameterChange, parameters.alias],
  );

  const onWindowsStoreUnavailable = useCallback(() => {
    // Nothing on mac or Linux answers for the Windows store, so the token path is the only one.
    if (parameters.certType === "WINDOWS_STORE") {
      onParameterChange("certType", "PKCS11");
    }
  }, [onParameterChange, parameters.certType]);

  const onDriverDetected = useCallback(
    (path: string) => {
      if (parameters.pkcs11LibraryPath) {
        return;
      }
      setLibrarySelection(path);
      onParameterChange("pkcs11LibraryPath", path);
    },
    [onParameterChange, parameters.pkcs11LibraryPath],
  );

  const {
    certs,
    loading,
    error,
    libraries,
    supported,
    capsReady,
    clear,
    loadWindowsCerts,
    loadPkcs11Certs,
  } = useHardwareCertificates({
    isWindowsStore,
    pkcs11: {
      libraryPath: parameters.pkcs11LibraryPath,
      pin: parameters.password,
      slot: parameters.pkcs11Slot,
    },
    onSoleCertificate,
    onWindowsStoreUnavailable,
    onDriverDetected,
  });

  const selected: HardwareCertificateInfo | undefined = certs.find(
    (cert) => cert.alias === parameters.alias,
  );

  const selectKind = (kind: "WINDOWS_STORE" | "PKCS11") => {
    if (parameters.certType === kind) {
      return;
    }
    onParameterChange("certType", kind);
    onParameterChange("alias", undefined);
    clear();
  };

  const onLibraryChange = (value: string | null) => {
    const selection = value ?? "";
    setLibrarySelection(selection);
    clear();
    onParameterChange("alias", undefined);
    onParameterChange(
      "pkcs11LibraryPath",
      selection === CUSTOM_LIBRARY_VALUE ? customLibrary || "" : selection,
    );
  };

  const libraryOptions = [
    // Label = driver name only; the long path goes under the dropdown so the
    // input doesn't overflow / scroll horizontally.
    ...libraries.map((l) => ({ value: l.path, label: l.name })),
    {
      value: CUSTOM_LIBRARY_VALUE,
      label: t("certSign.hardware.customLibrary", "Custom driver path…"),
    },
  ];
  const selectedLibraryPath =
    librarySelection && librarySelection !== CUSTOM_LIBRARY_VALUE
      ? librarySelection
      : null;

  /**
   * The chosen certificate, or the reason there is nothing to show yet.
   *
   * <p>Only the alias is carried in the tool's parameters, so the rest is looked up in the list
   * that was loaded. On a token that list needs the PIN, so after the panel is reopened the alias
   * can be all there is to show.
   */
  const summary = () => {
    if (selected) {
      const issuer = distinctIssuer(selected);
      const validity = validityOf(selected);
      return (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {displayName(selected)}
          </Text>
          {issuer && (
            <Text size="xs" c="dimmed">
              {issuer}
            </Text>
          )}
          <Text size="xs" c={validity === "valid" ? "dimmed" : "red"}>
            {validity === "valid"
              ? `${t("certSign.hardware.expires", "expires")} ${expiryDate(selected)}`
              : validity === "expired"
                ? t("certSign.hardware.expired", "expired")
                : t("certSign.hardware.notYetValid", "not yet valid")}
          </Text>
        </Stack>
      );
    }
    if (parameters.alias) {
      return (
        <Text size="sm" style={{ wordBreak: "break-all" }}>
          {parameters.alias}
        </Text>
      );
    }
    return (
      <Text size="sm" c="dimmed">
        {t("certSign.hardware.noneChosen", "No certificate chosen yet")}
      </Text>
    );
  };

  const certificateRow = (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("certSign.hardware.certificate", "Certificate")}
      </Text>
      {summary()}
      <Button
        variant="secondary"
        onClick={() => setPicking(true)}
        disabled={disabled || loading}
      >
        {parameters.alias
          ? t("certSign.hardware.change", "Change certificate")
          : t("certSign.hardware.browse", "Choose certificate…")}
      </Button>
    </Stack>
  );

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
            variant={isWindowsStore ? "primary" : "secondary"}
            accent={isWindowsStore ? "success" : "default"}
            onClick={() => selectKind("WINDOWS_STORE")}
            disabled={disabled || loading}
            style={{
              flex: 1,
              fontSize: "11px",
              minHeight: 40,
              height: "auto",
              whiteSpace: "normal",
              lineHeight: 1.15,
            }}
          >
            {t("certSign.format.windowsStore", "Windows certificate store")}
          </Button>
          <Button
            variant={!isWindowsStore ? "primary" : "secondary"}
            accent={!isWindowsStore ? "success" : "default"}
            onClick={() => selectKind("PKCS11")}
            disabled={disabled || loading}
            style={{
              flex: 1,
              fontSize: "11px",
              minHeight: 40,
              height: "auto",
              whiteSpace: "normal",
              lineHeight: 1.15,
            }}
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
          {certificateRow}
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
            variant="secondary"
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
          {certs.length > 0 && certificateRow}
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

      <HardwareCertificateModal
        opened={picking}
        onClose={() => setPicking(false)}
        certs={certs}
        loading={loading}
        error={error}
        selectedAlias={parameters.alias}
        onSelect={(cert) => onParameterChange("alias", cert.alias)}
        onRefresh={isWindowsStore ? loadWindowsCerts : loadPkcs11Certs}
      />
    </Stack>
  );
};

export default HardwareCertificateSettings;
