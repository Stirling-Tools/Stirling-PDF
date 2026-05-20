import { useEffect, useState } from "react";
import { Box, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { formatFileSize } from "@app/utils/fileUtils";

interface HtmlViewerProps {
  file: File;
}

export function HtmlViewer({ file }: HtmlViewerProps) {
  const { t } = useTranslation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Box style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Paper
        radius={0}
        p="xs"
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-2)",
          flexShrink: 0,
        }}
      >
        <Text size="xs" c="dimmed">
          {t("viewer.nonPdf.htmlPreviewWarning", {
            size: formatFileSize(file.size),
          })}
        </Text>
      </Paper>
      {objectUrl && (
        <iframe
          src={objectUrl}
          title={t("viewer.nonPdf.htmlPreview")}
          sandbox="allow-scripts"
          style={{ flex: 1, border: "none", background: "#fff" }}
        />
      )}
    </Box>
  );
}
