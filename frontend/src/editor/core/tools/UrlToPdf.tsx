import { useState } from "react";
import { TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "@editor/hooks/useEndpointConfig";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import {
  isValidWebUrl,
  useUrlToPdfOperation,
} from "@editor/hooks/tools/urlToPdf/useUrlToPdfOperation";
import type { BaseToolProps } from "@editor/types/tool";

export default function UrlToPdf({ onPreviewFile }: BaseToolProps) {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const operation = useUrlToPdfOperation();
  const { enabled, loading, error } = useEndpointEnabled("url-to-pdf");

  // Also protect direct links and a tool that was already selected when disabled.
  if (loading || error || enabled !== true) return null;

  const hasResults = operation.files.length > 0;
  const urlValid = isValidWebUrl(urlInput);
  const urlError =
    urlTouched && urlInput.trim() && !urlValid
      ? t("urlToPdf.invalidUrl", "Enter a valid HTTP or HTTPS URL.")
      : null;
  return createToolFlow({
    files: { selectedFiles: [], isVisible: false },
    steps: [
      {
        title: t("urlToPdf.urlLabel", "Web page URL"),
        content: (
          <TextInput
            aria-label={t("urlToPdf.urlLabel", "Web page URL")}
            placeholder="https://example.com"
            type="url"
            value={urlInput}
            disabled={operation.isLoading}
            error={urlError}
            onBlur={() => setUrlTouched(true)}
            onChange={(event) => {
              setUrlInput(event.currentTarget.value);
              operation.resetResults();
              operation.clearError();
            }}
          />
        ),
      },
    ],
    executeButton: {
      text: t("urlToPdf.submit", "Convert to PDF"),
      loadingText: t("loading", "Loading..."),
      isVisible: !hasResults,
      disableScopeHints: true,
      disabledReason: urlValid ? null : "invalidParams",
      onClick: () => operation.executeOperation({ urlInput }, []),
    },
    review: {
      isVisible: hasResults,
      operation,
      title: t("urlToPdf.results", "Converted PDF"),
      onFileClick: (file) => onPreviewFile?.(file),
    },
  });
}
