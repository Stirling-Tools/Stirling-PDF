import { useEffect, useState } from "react";
import { Box, Center, Group, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@editor/ui/ActionIcon";
import { Button } from "@editor/ui/Button";
import { EmptyState } from "@editor/ui/EmptyState";
import { Icon } from "@editor/ui/Icon";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { formatFileSize } from "@editor/utils/fileUtils";

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

  const size = formatFileSize(file.size);
  // The full caveat does not fit beside the floating Convert button on a phone.
  const warning = isMobile
    ? t("viewer.nonPdf.htmlPreviewWarningShort", {
        size,
        defaultValue: "HTML preview · {{size}}",
      })
    : t("viewer.nonPdf.htmlPreviewWarning", { size });

  return (
    <Box style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Paper
        radius={0}
        style={{
          borderBottom: "1px solid var(--c-border)",
          flexShrink: 0,
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          paddingLeft: "var(--mantine-spacing-sm)",
          // NonPdfViewer floats its "Convert to PDF" button over this row, so
          // keep the notice clear of it instead of running underneath.
          paddingRight:
            "max(var(--mantine-spacing-sm), var(--nonpdf-action-inset, 0rem))",
        }}
      >
        <Group gap={8} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Icon
            name="triangle-alert"
            size="0.9rem"
            style={{ color: "var(--c-warning)", flexShrink: 0 }}
          />
          <Text
            size="xs"
            c="dimmed"
            truncate
            title={warning}
            style={{ flex: 1, minWidth: 0 }}
          >
            {warning}
          </Text>
          {/* Opt-in has to stay reversible without closing and reopening the file. */}
          {isMobile && optedIn && (
            <ActionIcon
              variant="tertiary"
              size="sm"
              aria-label={t("viewer.nonPdf.htmlHidePreview", "Hide preview")}
              title={t("viewer.nonPdf.htmlHidePreview", "Hide preview")}
              onClick={() => setOptedIn(false)}
              style={{ flexShrink: 0 }}
            >
              <Icon name="eye-off" size="1rem" />
            </ActionIcon>
          )}
        </Group>
      </Paper>
      {showPreview ? (
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            background: "var(--c-bg)",
            padding: isMobile ? 0 : "var(--mantine-spacing-md)",
          }}
        >
          {objectUrl && (
            <iframe
              src={objectUrl}
              title={t("viewer.nonPdf.htmlPreview")}
              sandbox="allow-scripts"
              style={{
                flex: 1,
                width: "100%",
                border: "none",
                borderRadius: isMobile ? 0 : 6,
                // The previewed document paints its own background; white keeps
                // pages without one readable, matching the markdown sheet.
                background: "#fff",
                display: "block",
              }}
            />
          )}
        </Box>
      ) : (
        <Center
          style={{
            flex: 1,
            padding: "var(--mantine-spacing-lg)",
            background: "var(--c-bg)",
          }}
        >
          <EmptyState
            size="compact"
            icon={<Icon name="monitor-smartphone" size="2rem" />}
            title={t(
              "viewer.nonPdf.htmlPreviewMobileTitle",
              "Preview off on mobile",
            )}
            description={t(
              "viewer.nonPdf.htmlPreviewMobileHidden",
              "HTML pages are laid out for desktop widths, so the preview is off by default here.",
            )}
            actions={
              <Button variant="secondary" onClick={() => setOptedIn(true)}>
                {t("viewer.nonPdf.htmlShowPreview", "Show preview anyway")}
              </Button>
            }
          />
        </Center>
      )}
    </Box>
  );
}
