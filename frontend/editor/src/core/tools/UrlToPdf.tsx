import { useState } from "react";
import { Alert, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import {
  isValidWebUrl,
  useUrlToPdfOperation,
} from "@app/hooks/tools/urlToPdf/useUrlToPdfOperation";
import type { BaseToolProps } from "@app/types/tool";

export default function UrlToPdf({ onPreviewFile }: BaseToolProps) {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const operation = useUrlToPdfOperation();
  const { enabled, loading, error } = useEndpointEnabled("url-to-pdf");

  // Also protect direct links and a tool that was already selected when disabled.
  if (loading || error || enabled !== true) return null;

  const hasResults = operation.files.length > 0;
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
      disabledReason: isValidWebUrl(urlInput) ? null : "invalidParams",
      onClick: () => operation.executeOperation({ urlInput }, []),
    },
    belowExecuteButton: operation.errorMessage ? (
      <Alert color="red">{operation.errorMessage}</Alert>
    ) : undefined,
    review: {
      isVisible: hasResults,
      operation,
      title: t("urlToPdf.results", "Converted PDF"),
      onFileClick: (file) => onPreviewFile?.(file),
    },
  });
}
