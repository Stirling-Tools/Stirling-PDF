import { Alert, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import {
  chooseMacosSigningIdentity,
  MacosSigningIdentity,
} from "@app/services/macosKeychainService";

export interface MacKeychainPickerProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const isGuidish = (value?: string | null) =>
  !value ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );

const displayName = (identity: MacosSigningIdentity): string => {
  if (identity.subjectCommonName && !isGuidish(identity.subjectCommonName)) {
    return identity.subjectCommonName;
  }
  if (identity.alias && !isGuidish(identity.alias)) {
    return identity.alias;
  }
  return identity.subjectCommonName || identity.alias;
};

/** Opens the native macOS identity picker (desktop build only). */
export function MacKeychainPicker({
  parameters,
  onParameterChange,
  disabled = false,
}: MacKeychainPickerProps) {
  const { t } = useTranslation();
  const selected = parameters.macosIdentity;

  const chooseCertificate = async () => {
    const result = await chooseMacosSigningIdentity();
    if (result.status === "selected") {
      onParameterChange("certType", "MACOS_KEYCHAIN");
      onParameterChange("alias", result.identity.alias);
      onParameterChange("macosIdentity", result.identity);
      onParameterChange("password", "");
      return;
    }
    if (result.status === "cancelled") {
      onParameterChange("alias", undefined);
      onParameterChange("macosIdentity", undefined);
      return;
    }
    onParameterChange("alias", undefined);
    onParameterChange("macosIdentity", undefined);
  };

  return (
    <Stack gap="sm">
      <Button
        variant="secondary"
        onClick={() => void chooseCertificate()}
        disabled={disabled}
      >
        {t(
          "certSign.hardware.chooseKeychainCertificate",
          "Choose certificate…",
        )}
      </Button>

      {selected ? (
        <Alert color="green" variant="light">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              {displayName(selected)}
            </Text>
            {selected.issuerCommonName &&
              selected.issuerCommonName !== selected.subjectCommonName && (
                <Text size="xs" c="dimmed">
                  {t("certSign.hardware.issuer", "Issuer")}:{" "}
                  {selected.issuerCommonName}
                </Text>
              )}
            {selected.notAfter ? (
              <Text size="xs" c="dimmed">
                {t("certSign.hardware.expires", "expires")}{" "}
                {selected.notAfter.slice(0, 10)}
              </Text>
            ) : null}
          </Stack>
        </Alert>
      ) : (
        <Text size="xs" c="dimmed">
          {t(
            "certSign.hardware.keychainHint",
            "Use the macOS certificate picker to select a signing certificate from your Keychain.",
          )}
        </Text>
      )}
    </Stack>
  );
}
