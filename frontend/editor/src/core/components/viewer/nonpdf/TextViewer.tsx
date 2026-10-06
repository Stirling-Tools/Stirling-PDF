import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Center,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";

import { formatFileSize } from "@app/utils/fileUtils";
import { renderMarkdown } from "@app/components/viewer/nonpdf/MarkdownRenderer";

interface TextViewerProps {
  file: File;
  isMarkdown: boolean;
}

const LINE_HEIGHT_PX = 22;

export function TextViewer({ file, isMarkdown }: TextViewerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(!isMarkdown);
  const [renderMd, setRenderMd] = useState(isMarkdown);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    file.text().then(setContent);
  }, [file]);

  const lines = useMemo(() => content?.split("\n") ?? [], [content]);

  const renderedMarkdown = useMemo(
    () =>
      content !== null && isMarkdown && renderMd
        ? renderMarkdown(content)
        : null,
    [content, isMarkdown, renderMd],
  );

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: 30,
  });

  return (
    <Stack gap={0} style={{ height: "100%", flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <Paper
        radius={0}
        px="sm"
        style={{
          borderBottom: "1px solid var(--c-border)",
          backgroundColor: "var(--c-surface)",
          flexShrink: 0,
          minHeight: 44,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Group gap="md" align="center">
          <Text size="xs" c="dimmed">
            {t("viewer.nonPdf.textStats", {
              lines: lines.length.toLocaleString(),
              size: formatFileSize(file.size),
            })}
          </Text>
          {!isMarkdown && (
            <Checkbox
              label={<Text size="xs">{t("viewer.nonPdf.lineNumbers")}</Text>}
              checked={showLineNumbers}
              onChange={(e) => setShowLineNumbers(e.currentTarget.checked)}
              size="xs"
            />
          )}
          {isMarkdown && (
            <Checkbox
              label={<Text size="xs">{t("viewer.nonPdf.renderMarkdown")}</Text>}
              checked={renderMd}
              onChange={(e) => setRenderMd(e.currentTarget.checked)}
              size="xs"
            />
          )}
        </Group>
      </Paper>

      {/* Content */}
      <div
        ref={parentRef}
        style={{
          flex: 1,
          overflow: "auto",
          position: "relative",
          backgroundColor: "var(--c-bg)",
          padding: renderedMarkdown !== null ? "1rem" : 0,
        }}
      >
        {content === null ? (
          <Center style={{ height: "100%" }}>
            <Text c="dimmed" size="sm">
              {t("viewer.nonPdf.loading")}
            </Text>
          </Center>
        ) : renderedMarkdown !== null ? (
          <Box
            style={{
              maxWidth: 800,
              margin: "0 auto",
              padding: "20px 28px",
              background: "#ffffff",
              // The rendered page is a white sheet in either scheme, so its
              // copy takes a fixed dark ink rather than inheriting the theme's,
              // which would be near-white here.
              color: "var(--c-text-on-light)",
              borderRadius: 6,
            }}
          >
            {renderedMarkdown}
          </Box>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: `${LINE_HEIGHT_PX}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const line = lines[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "flex",
                    alignItems: "flex-start",
                    minHeight: `${LINE_HEIGHT_PX}px`,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {showLineNumbers && (
                    <span
                      style={{
                        paddingRight: 16,
                        paddingLeft: 8,
                        textAlign: "right",
                        color: "var(--c-text-muted)",
                        userSelect: "none",
                        borderRight: "1px solid var(--c-border)",
                        minWidth: `${String(lines.length).length + 2}ch`,
                        flexShrink: 0,
                      }}
                    >
                      {virtualRow.index + 1}
                    </span>
                  )}
                  <span
                    style={{
                      paddingLeft: showLineNumbers ? 12 : 8,
                      flex: 1,
                      color: "var(--c-text)",
                    }}
                  >
                    {line || " "}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Stack>
  );
}
