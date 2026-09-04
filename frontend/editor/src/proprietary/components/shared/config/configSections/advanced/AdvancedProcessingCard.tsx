import { useEffect, useMemo, useState } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import {
  NumberInput,
  Stack,
  Paper,
  Text,
  Loader,
  Group,
  TextInput,
  MultiSelect,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { alert } from "@app/components/toast";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import apiClient from "@app/services/apiClient";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { AdvancedCardProps } from "@app/components/shared/config/configSections/advanced/advancedCardProps";

/**
 * Image DPI and the OCR tessdata directory. The language list and its
 * downloads are their own live state - they are not part of the settings draft.
 */
export function AdvancedProcessingCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: AdvancedCardProps) {
  const { t } = useTranslation();

  const [tessdataLanguages, setTessdataLanguages] = useState<string[]>([]);
  const [remoteTessdataLanguages, setRemoteTessdataLanguages] = useState<
    string[]
  >([]);
  const [tessdataDirWritable, setTessdataDirWritable] = useState<boolean>(true);
  const [manualDownloadLinks, setManualDownloadLinks] = useState<string[]>([]);
  const [tessdataLanguagesLoading, setTessdataLanguagesLoading] =
    useState(false);
  const [downloadLanguagesLoading, setDownloadLanguagesLoading] =
    useState(false);
  const [selectedDownloadLanguages, setSelectedDownloadLanguages] = useState<
    string[]
  >([]);

  useEffect(() => {
    if (!loginEnabled) return;

    const fetchTessdataLanguages = async () => {
      setTessdataLanguagesLoading(true);
      try {
        const { data } = await apiClient.get<{
          installed: string[];
          available: string[];
          writable?: boolean;
        }>("/api/v1/ui-data/tessdata-languages", {
          suppressErrorToast: true,
        });
        const installed = data.installed || [];
        const available = data.available || [];
        setTessdataLanguages(installed);
        setRemoteTessdataLanguages(
          available.filter((lang) => !installed.includes(lang)),
        );
        setTessdataDirWritable(data.writable !== false);
        setManualDownloadLinks([]);
      } catch (error) {
        console.error(
          "[AdvancedProcessingCard] Failed to load tessdata languages",
          error,
        );
        setTessdataLanguages([]);
        setRemoteTessdataLanguages([]);
        setTessdataDirWritable(true);
        setManualDownloadLinks([]);
      } finally {
        setTessdataLanguagesLoading(false);
      }
    };

    fetchTessdataLanguages();
  }, [loginEnabled]);

  const refreshTessdataWithRetry = async (retries = 3, delayMs = 400) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const { data } = await apiClient.get<{
          installed: string[];
          available: string[];
          writable?: boolean;
        }>("/api/v1/ui-data/tessdata-languages", { suppressErrorToast: true });
        const installed = data.installed || [];
        const available = data.available || [];
        setTessdataLanguages(installed);
        setRemoteTessdataLanguages(
          available.filter((lang) => !installed.includes(lang)),
        );
        setTessdataDirWritable(data.writable !== false);
        setManualDownloadLinks([]);
        return;
      } catch (err) {
        if (attempt === retries - 1) {
          console.error(
            "[AdvancedProcessingCard] Retry refresh tessdata failed",
            err,
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  };

  const safeLangRegex = useMemo(() => new RegExp("[^A-Za-z0-9_+\\-]", "g"), []);

  const handleDownloadTessdataLanguages = async () => {
    if (!loginEnabled) return;
    if (selectedDownloadLanguages.length === 0) {
      alert({
        alertType: "warning",
        title: t(
          "admin.settings.advanced.tessdataDir.downloadMissingTitle",
          "No language selected",
        ),
        body: t(
          "admin.settings.advanced.tessdataDir.downloadMissingBody",
          "Please select at least one language to download.",
        ),
        expandable: false,
      });
      return;
    }
    // Ensure selection is a subset of remote languages to prevent invalid requests
    const remoteSet = new Set(remoteTessdataLanguages);
    const invalidSelection = selectedDownloadLanguages.filter(
      (lang) => !remoteSet.has(lang),
    );
    if (invalidSelection.length > 0) {
      alert({
        alertType: "warning",
        title: t(
          "admin.settings.advanced.tessdataDir.downloadInvalidTitle",
          "Invalid selection",
        ),
        body: t(
          "admin.settings.advanced.tessdataDir.downloadInvalidBody",
          "Some selected languages are not available to download. Please refresh and choose from the list.",
        ),
        expandable: false,
      });
      return;
    }
    setDownloadLanguagesLoading(true);
    try {
      await apiClient.post(
        "/api/v1/ui-data/tessdata/download",
        { languages: selectedDownloadLanguages },
        {
          suppressErrorToast: true,
        },
      );
      alert({
        alertType: "success",
        title: t(
          "admin.settings.advanced.tessdataDir.downloadSuccessTitle",
          "Languages downloaded",
        ),
        body: t(
          "admin.settings.advanced.tessdataDir.downloadSuccessBody",
          "The selected tessdata languages have been saved.",
        ),
      });
      // Refresh installed list with retry in case filesystem sync is delayed
      await refreshTessdataWithRetry();
      setSelectedDownloadLanguages([]);
      setManualDownloadLinks([]);
    } catch (error) {
      console.error(
        "[AdvancedProcessingCard] Download tessdata languages failed",
        error,
      );
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const serverMessage = isAxiosError(error)
        ? error.response?.data?.message
        : undefined;

      if (status === 403) {
        console.warn(
          "[AdvancedProcessingCard] Tessdata directory not writable, falling back to manual download:",
          serverMessage,
        );
        setTessdataDirWritable(false);
        setManualDownloadLinks(
          selectedDownloadLanguages.map((lang) => {
            const safeLang = lang.replace(safeLangRegex, "");
            return `https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/${safeLang}.traineddata`;
          }),
        );
        const message = t(
          "admin.settings.advanced.tessdataDir.downloadErrorPermission",
          {
            defaultValue:
              "Tessdata directory is not writable: {{message}}. Please choose a writable directory (e.g. under the application data folder) or adjust permissions.",
            message:
              serverMessage ?? settings.tessdataDir ?? "unknown location",
          },
        );
        alert({
          alertType: "error",
          title: t(
            "admin.settings.advanced.tessdataDir.downloadErrorTitle",
            "Download Failed",
          ),
          body: message,
          expandable: false,
        });
        return;
      }

      let message: string;
      if (!isAxiosError(error) || !error.response) {
        message = t(
          "admin.settings.advanced.tessdataDir.downloadErrorNetwork",
          "Download failed due to a network error. Please check your connection and try again.",
        );
      } else if (status !== undefined && status >= 500) {
        message = t(
          "admin.settings.advanced.tessdataDir.downloadErrorServer",
          "The server encountered an error while downloading tessdata languages. Please try again later.",
        );
      } else {
        message = t(
          "admin.settings.advanced.tessdataDir.downloadErrorGeneric",
          {
            defaultValue:
              "Download failed: {{message}}. Please try again later.",
            message:
              serverMessage ?? settings.tessdataDir ?? "unknown location",
          },
        );
      }
      alert({
        alertType: "error",
        title: t(
          "admin.settings.advanced.tessdataDir.downloadErrorTitle",
          "Download Failed",
        ),
        body: message,
        expandable: false,
      });
    } finally {
      setDownloadLanguagesLoading(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t("admin.settings.advanced.maxDPI.label", "Maximum DPI")}
                </span>
                <PendingBadge show={isFieldPending("maxDPI")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.advanced.maxDPI.description",
                    "Maximum DPI for image processing (0 = unlimited)",
                  )}
                />
              </Group>
            }
            value={settings.maxDPI || 0}
            onChange={(value) =>
              setSettings({ ...settings, maxDPI: Number(value) })
            }
            min={0}
            max={3000}
            disabled={!loginEnabled}
          />
        </div>

        {/* Tessdata Directory */}
        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.advanced.tessdataDir.label",
                    "Tessdata Directory",
                  )}
                </span>
                <PendingBadge show={isFieldPending("tessdataDir")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.advanced.tessdataDir.description",
                    "Path to the directory containing Tessdata files for OCR",
                  )}
                />
              </Group>
            }
            value={settings.tessdataDir || ""}
            onChange={(e) =>
              setSettings({ ...settings, tessdataDir: e.target.value })
            }
            placeholder="/usr/share/tessdata"
            disabled={!loginEnabled}
          />
          {tessdataLanguagesLoading ? (
            <Group gap="xs" mt={6}>
              <Loader size="xs" />
              <Text size="xs">
                {t(
                  "admin.settings.advanced.tessdataDir.loadingLanguages",
                  "Loading installed tessdata languages...",
                )}
              </Text>
            </Group>
          ) : (
            <Text size="xs" c="dimmed" mt={6}>
              {tessdataLanguages.length > 0
                ? `${t("admin.settings.advanced.tessdataDir.installedLanguages", "Installed tessdata languages")}: ${tessdataLanguages.join(", ")}`
                : t(
                    "admin.settings.advanced.tessdataDir.noLanguages",
                    "No tessdata languages found in the configured directory",
                  )}
            </Text>
          )}
          <Stack gap="xs" mt="sm">
            <MultiSelect
              label={t(
                "admin.settings.advanced.tessdataDir.downloadLabel",
                "Download additional tessdata languages",
              )}
              placeholder={t(
                "admin.settings.advanced.tessdataDir.downloadPlaceholder",
                "Select languages",
              )}
              data={remoteTessdataLanguages.map((lang) => ({
                value: lang,
                label: lang,
              }))}
              searchable
              disabled={!loginEnabled || remoteTessdataLanguages.length === 0}
              value={selectedDownloadLanguages}
              onChange={setSelectedDownloadLanguages}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
              nothingFoundMessage={t(
                "admin.settings.advanced.tessdataDir.downloadNothingFound",
                "No additional languages found",
              )}
            />
            {!tessdataDirWritable && (
              <Text size="xs" c="yellow.4">
                {t(
                  "admin.settings.advanced.tessdataDir.permissionNotice",
                  "The tessdata path is not writable. Downloads will be opened in the browser; please save the .traineddata files manually into the tessdata folder.",
                )}
              </Text>
            )}
            {!tessdataDirWritable && manualDownloadLinks.length > 0 && (
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.advanced.tessdataDir.manualLinks",
                    "Manual downloads: click the links and place the files into the tessdata folder.",
                  )}
                </Text>
                <Stack gap={4}>
                  {manualDownloadLinks.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "12px" }}
                    >
                      {link}
                    </a>
                  ))}
                </Stack>
              </Stack>
            )}
            <Group justify="flex-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleDownloadTessdataLanguages}
                loading={downloadLanguagesLoading}
                disabled={!loginEnabled || remoteTessdataLanguages.length === 0}
              >
                {t(
                  "admin.settings.advanced.tessdataDir.downloadButton",
                  "Download selected languages",
                )}
              </Button>
            </Group>
          </Stack>
        </div>
      </Stack>
    </Paper>
  );
}
