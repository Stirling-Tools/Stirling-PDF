import { useEffect, useState } from "react";
import { Box, Center, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { Button } from "@app/ui/Button";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { formatFileSize } from "@app/utils/fileUtils";

interface HtmlViewerProps {
  file: File;
}

export function HtmlViewer({ file }: HtmlViewerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // Phones render a desktop-width document into ~400px, which reads as a blank
  // column, so the iframe is opt-in there. Derived rather than seeded into
  // state because useIsMobile resolves after first paint.
  const [optedIn, setOptedIn] = useState(false);
  const showPreview = !isMobile || optedIn;

  useEffect(() => {
    if (!showPreview) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, showPreview]);

  return (
    <Box style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Paper
        radius={0}
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-2)",
          flexShrink: 0,
          // Padding set here rather than via `p`, whose shorthand would reset
          // the right inset below. NonPdfViewer floats its "Convert to PDF"
          // button over this row, so keep the notice clear of it instead of
          // running underneath.
          padding: "0.5rem",
          paddingRight: "max(0.5rem, var(--nonpdf-action-inset, 0rem))",
        }}
      >
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="xs" c="dimmed" style={{ minWidth: 0, flex: 1 }}>
            {t("viewer.nonPdf.htmlPreviewWarning", {
              size: formatFileSize(file.size),
            })}
          </Text>
          {/* Opting in used to be one-way: the only way back was closing and
              reopening the file. */}
          {isMobile && optedIn && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setOptedIn(false)}
              style={{ flexShrink: 0 }}
            >
              {t("viewer.nonPdf.htmlHidePreview", "Hide preview")}
            </Button>
          )}
        </Group>
      </Paper>
      {showPreview ? (
        objectUrl && (
          <iframe
            src={objectUrl}
            title={t("viewer.nonPdf.htmlPreview")}
            sandbox="allow-scripts"
            style={{ flex: 1, border: "none", background: "#fff" }}
          />
        )
      ) : (
        <Center style={{ flex: 1, padding: "1.5rem" }}>
          <Stack align="center" gap="sm" style={{ maxWidth: "22rem" }}>
            <Text size="sm" c="dimmed" ta="center">
              {t(
                "viewer.nonPdf.htmlPreviewMobileHidden",
                "HTML pages are laid out for desktop widths, so the preview is off by default here.",
              )}
            </Text>
            <Button variant="secondary" onClick={() => setOptedIn(true)}>
              {t("viewer.nonPdf.htmlShowPreview", "Show preview anyway")}
            </Button>
          </Stack>
        </Center>
      )}
    </Box>
  );
}
