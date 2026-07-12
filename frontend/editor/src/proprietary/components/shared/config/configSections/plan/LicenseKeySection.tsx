import React, { useState } from "react";
import {
  Collapse,
  Alert,
  TextInput,
  Paper,
  Stack,
  Group,
  Text,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { FilePicker } from "@app/ui/FilePicker";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { alert } from "@app/components/toast";
import { LicenseInfo } from "@app/services/licenseService";
import licenseService from "@app/services/licenseService";
import { useLicense } from "@app/contexts/LicenseContext";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";

interface LicenseKeySectionProps {
  currentLicenseInfo?: LicenseInfo;
}

const LicenseKeySection: React.FC<LicenseKeySectionProps> = ({
  currentLicenseInfo,
}) => {
  const { t } = useTranslation();
  const { refetchLicense } = useLicense();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>("");
  const [savingLicense, setSavingLicense] = useState(false);
  const [inputMethod, setInputMethod] = useState<"text" | "file">("text");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  const handleSaveLicense = async () => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      setSavingLicense(true);

      let response;

      if (inputMethod === "file" && licenseFile) {
        // Upload file
        response = await licenseService.saveLicenseFile(licenseFile);
      } else if (inputMethod === "text" && licenseKeyInput.trim()) {
        // Save key string
        response = await licenseService.saveLicenseKey(licenseKeyInput.trim());
      } else {
        alert({
          alertType: "error",
          title: t("admin.error", "Error"),
          body: t(
            "admin.settings.premium.noInput",
            "Please provide a license key or file",
          ),
        });
        return;
      }

      if (response.success) {
        // Refresh license context to update all components
        await refetchLicense();

        const successMessage =
          inputMethod === "file"
            ? t(
                "admin.settings.premium.file.successMessage",
                "License file uploaded and activated successfully",
              )
            : t(
                "admin.settings.premium.key.successMessage",
                "License key activated successfully",
              );

        alert({
          alertType: "success",
          title: t("success", "Success"),
          body: successMessage,
        });

        // Clear inputs
        setLicenseKeyInput("");
        setLicenseFile(null);
        setInputMethod("text"); // Reset to default
      } else {
        alert({
          alertType: "error",
          title: t("admin.error", "Error"),
          body:
            response.error ||
            t("admin.settings.saveError", "Failed to save license"),
        });
      }
    } catch (error) {
      console.error("Failed to save license:", error);
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save license"),
      });
    } finally {
      setSavingLicense(false);
    }
  };

  return (
    <div>
      <Button
        variant="tertiary"
        leftSection={
          <LocalIcon
            icon={
              showLicenseKey ? "expand-less-rounded" : "expand-more-rounded"
            }
            width="1.25rem"
            height="1.25rem"
          />
        }
        onClick={() => setShowLicenseKey(!showLicenseKey)}
      >
        {t(
          "admin.settings.premium.licenseKey.toggle",
          "Got a license key or certificate file?",
        )}
      </Button>

      <Collapse in={showLicenseKey} mt="md">
        <Stack gap="md">
          <Alert
            variant="light"
            color="blue"
            icon={<InfoRoundedIcon width="1rem" height="1rem" />}
          >
            <Text size="sm">
              {t(
                "admin.settings.premium.licenseKey.info",
                "If you have a license key or certificate file from a direct purchase, you can enter it here to activate premium or enterprise features.",
              )}
            </Text>
          </Alert>

          {/* Severe warning if license already exists */}
          {currentLicenseInfo?.licenseKey && (
            <Alert
              variant="light"
              color="red"
              icon={<WarningRoundedIcon width="1rem" height="1rem" />}
              title={t(
                "admin.settings.premium.key.overwriteWarning.title",
                "⚠️ Warning: Existing License Detected",
              )}
            >
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  {t(
                    "admin.settings.premium.key.overwriteWarning.line1",
                    "Overwriting your current license key cannot be undone.",
                  )}
                </Text>
                <Text size="sm">
                  {t(
                    "admin.settings.premium.key.overwriteWarning.line2",
                    "Your previous license will be permanently lost unless you have backed it up elsewhere.",
                  )}
                </Text>
                <Text size="sm" fw={500}>
                  {t(
                    "admin.settings.premium.key.overwriteWarning.line3",
                    "Important: Keep license keys private and secure. Never share them publicly.",
                  )}
                </Text>
              </Stack>
            </Alert>
          )}

          {/* Show current license source */}
          {currentLicenseInfo?.licenseKey && (
            <Alert
              variant="light"
              color="green"
              icon={<CheckCircleRoundedIcon width="1rem" height="1rem" />}
            >
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  {t(
                    "admin.settings.premium.currentLicense.title",
                    "Active License",
                  )}
                </Text>
                <Text size="xs">
                  {currentLicenseInfo.licenseKey.startsWith("file:")
                    ? t(
                        "admin.settings.premium.currentLicense.file",
                        "Source: License file ({{path}})",
                        {
                          path: currentLicenseInfo.licenseKey.substring(5),
                        },
                      )
                    : t(
                        "admin.settings.premium.currentLicense.key",
                        "Source: License key",
                      )}
                </Text>
                <Text size="xs">
                  {t(
                    "admin.settings.premium.currentLicense.type",
                    "Type: {{type}}",
                    {
                      type: currentLicenseInfo.licenseType,
                    },
                  )}
                </Text>
              </Stack>
            </Alert>
          )}

          {/* Input method selector */}
          <SegmentedControl
            value={inputMethod}
            onChange={(value) => {
              setInputMethod(value as "text" | "file");
              // Clear opposite input when switching
              if (value === "text") setLicenseFile(null);
              if (value === "file") setLicenseKeyInput("");
            }}
            options={[
              {
                label: t(
                  "admin.settings.premium.inputMethod.text",
                  "License Key",
                ),
                value: "text",
                disabled: !loginEnabled || savingLicense,
              },
              {
                label: t(
                  "admin.settings.premium.inputMethod.file",
                  "Certificate File",
                ),
                value: "file",
                disabled: !loginEnabled || savingLicense,
              },
            ]}
          />

          {/* Input area */}
          <Paper withBorder p="md" radius="md">
            <Stack gap="md">
              {inputMethod === "text" ? (
                /* Text input */
                <TextInput
                  label={t("admin.settings.premium.key.label", "License Key")}
                  description={t(
                    "admin.settings.premium.key.description",
                    "Enter your premium or enterprise license key. Premium features will be automatically enabled when a key is provided.",
                  )}
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  placeholder={
                    currentLicenseInfo?.licenseKey ||
                    "00000000-0000-0000-0000-000000000000"
                  }
                  type="password"
                  disabled={!loginEnabled || savingLicense}
                />
              ) : (
                /* File upload */
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t(
                      "admin.settings.premium.file.label",
                      "License Certificate File",
                    )}
                  </Text>
                  <Text size="xs" c="dimmed" mb="md">
                    {t(
                      "admin.settings.premium.file.description",
                      "Upload your .lic or .cert license file",
                    )}
                  </Text>
                  <FilePicker
                    onChange={setLicenseFile}
                    accept=".lic,.cert"
                    disabled={!loginEnabled || savingLicense}
                    variant="secondary"
                    leftSection={
                      <UploadFileRoundedIcon width="1rem" height="1rem" />
                    }
                  >
                    {licenseFile
                      ? licenseFile.name
                      : t(
                          "admin.settings.premium.file.choose",
                          "Choose License File",
                        )}
                  </FilePicker>
                  {licenseFile && (
                    <Text size="xs" c="dimmed" mt="xs">
                      {t(
                        "admin.settings.premium.file.selected",
                        "Selected: {{filename}} ({{size}})",
                        {
                          filename: licenseFile.name,
                          size: (licenseFile.size / 1024).toFixed(2) + " KB",
                        },
                      )}
                    </Text>
                  )}
                </div>
              )}

              <Group justify="flex-end">
                <Button
                  onClick={handleSaveLicense}
                  loading={savingLicense}
                  size="sm"
                  disabled={
                    !loginEnabled ||
                    (inputMethod === "text" && !licenseKeyInput.trim()) ||
                    (inputMethod === "file" && !licenseFile)
                  }
                >
                  {t("admin.settings.save", "Save Changes")}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Stack>
      </Collapse>
    </div>
  );
};

export default LicenseKeySection;
