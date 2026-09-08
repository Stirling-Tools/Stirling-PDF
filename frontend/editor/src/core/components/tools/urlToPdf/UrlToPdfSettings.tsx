import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  UrlToPdfParameters,
  isSupportedUrl,
} from "@app/hooks/tools/urlToPdf/useUrlToPdfParameters";

interface UrlToPdfSettingsProps {
  parameters: UrlToPdfParameters;
  onParameterChange: <K extends keyof UrlToPdfParameters>(
    key: K,
    value: UrlToPdfParameters[K],
  ) => void;
  disabled?: boolean;
  onSubmit?: () => void;
}

const UrlToPdfSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  onSubmit,
}: UrlToPdfSettingsProps) => {
  const { t } = useTranslation();

  const entered = parameters.urlInput.trim();
  const showFormatError = entered.length > 0 && !isSupportedUrl(entered);

  return (
    <Stack gap="md">
      <TextInput
        type="url"
        aria-label={t("urlToPdf.url.label", "Web address")}
        description={t(
          "urlToPdf.url.desc",
          "The page is fetched by the server, not by your browser",
        )}
        placeholder="https://example.com"
        value={parameters.urlInput}
        error={
          showFormatError
            ? t(
                "urlToPdf.url.error",
                "Enter a full http:// or https:// address",
              )
            : undefined
        }
        onChange={(event) =>
          onParameterChange("urlInput", event.currentTarget.value)
        }
        onKeyDown={(event) => {
          if (event.key === "Enter" && isSupportedUrl(parameters.urlInput)) {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        disabled={disabled}
        data-testid="url-to-pdf-input"
      />

      <Text size="xs" c="dimmed">
        {t(
          "urlToPdf.note",
          "Pages needing a sign-in, or that build themselves with JavaScript, will not come through as you see them in a browser.",
        )}
      </Text>
    </Stack>
  );
};

export default UrlToPdfSettings;
