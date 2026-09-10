import { useCallback, useMemo, useState } from "react";
import { Box, Text, Stack, Group, Tooltip, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useAnnotation } from "@embedpdf/plugin-annotation/react";
import { getAnnotations } from "@embedpdf/plugin-annotation";
import type { PdfAnnotationObject } from "@embedpdf/models";
import { useCommentAuthor } from "@app/contexts/CommentAuthorContext";
import { useViewer } from "@app/contexts/ViewerContext";
import LocalIcon from "@app/components/shared/LocalIcon";
import { SidebarBase } from "@app/components/viewer/SidebarBase";
import {
  formatAnnotationDate,
  getAuthorName,
  getAnnotationToolId,
  getAnnotationTypeLabel,
  getAnnotationColor,
  AnnotationTypeIcon,
  locateAnnotationOnPage,
} from "@app/components/viewer/annotationDisplayUtils";
import { downloadTextAsFile } from "@app/utils/downloadUtils";

interface MarkupsListSidebarProps {
  documentId: string;
  visible: boolean;
  rightOffset: string;
}

interface MarkupRow {
  pageIndex: number;
  ann: PdfAnnotationObject;
}

/** Wraps a CSV field in quotes and escapes embedded quotes if it needs it. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function MarkupsListSidebar({
  documentId,
  visible,
  rightOffset,
}: MarkupsListSidebarProps) {
  const { t } = useTranslation();
  const { displayName } = useCommentAuthor();
  const { scrollActions, getZoomState, toggleMarkupsListSidebar } =
    useViewer() ?? {};
  const { state } = useAnnotation(documentId);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Every annotation across the whole document, oldest-created-first within
  // a page. Replies (inReplyToId set) are sub-items of a comment thread, not
  // standalone markups, so they're excluded here — Comments already covers
  // those.
  const allRows = useMemo<MarkupRow[]>(() => {
    try {
      const byPage = getAnnotations(state) ?? {};
      const rows: MarkupRow[] = [];
      for (const [pageStr, tracked] of Object.entries(byPage)) {
        const pageIndex = Number(pageStr);
        for (const entry of tracked) {
          const ann = entry.object;
          if (ann?.inReplyToId) continue;
          rows.push({ pageIndex, ann });
        }
      }
      return rows;
    } catch {
      return [];
    }
  }, [state]);

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { ann } of allRows) {
      const key = getAnnotationToolId(ann) || `type-${ann.type}`;
      if (!seen.has(key)) seen.set(key, getAnnotationTypeLabel(ann, t));
    }
    return Array.from(seen.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [allRows, t]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return allRows.filter(({ ann }) => {
      if (typeFilter) {
        const key = getAnnotationToolId(ann) || `type-${ann.type}`;
        if (key !== typeFilter) return false;
      }
      if (!query) return true;
      const contents = (ann.contents || "").toLowerCase();
      const author = (ann.author || "").toLowerCase();
      return contents.includes(query) || author.includes(query);
    });
  }, [allRows, searchTerm, typeFilter]);

  const byPage = useMemo(() => {
    const grouped: Record<number, MarkupRow[]> = {};
    for (const row of filteredRows) {
      (grouped[row.pageIndex] ??= []).push(row);
    }
    return grouped;
  }, [filteredRows]);

  const pageNumbers = useMemo(
    () =>
      Object.keys(byPage)
        .map(Number)
        .sort((a, b) => a - b),
    [byPage],
  );

  const handleLocate = useCallback(
    (pageIndex: number, ann: PdfAnnotationObject) => {
      locateAnnotationOnPage(pageIndex, ann, {
        scrollToPage: scrollActions?.scrollToPage,
        getCurrentZoom: () => getZoomState?.()?.currentZoom,
      });
    },
    [scrollActions, getZoomState],
  );

  const handleExportCsv = useCallback(() => {
    const header = ["Page", "Type", "Author", "Date", "Color", "Content"];
    const lines = [header.map(csvField).join(",")];
    for (const { pageIndex, ann } of filteredRows) {
      lines.push(
        [
          String(pageIndex + 1),
          getAnnotationTypeLabel(ann, t),
          getAuthorName(ann, displayName),
          formatAnnotationDate(ann),
          getAnnotationColor(ann) ?? "",
          (ann.contents ?? "").replace(/\r?\n/g, " "),
        ]
          .map((field) => csvField(field))
          .join(","),
      );
    }
    downloadTextAsFile(lines.join("\r\n"), "markups.csv", "text/csv");
  }, [filteredRows, t, displayName]);

  if (!visible) return null;

  const headerActions =
    allRows.length > 0 ? (
      <Tooltip label={t("viewer.markupsList.exportCsv", "Export CSV")}>
        <ActionIcon
          variant="tertiary"
          accent="neutral"
          size="sm"
          aria-label={t("viewer.markupsList.exportCsv", "Export CSV")}
          onClick={handleExportCsv}
        >
          <LocalIcon icon="download" width="1.1rem" height="1.1rem" />
        </ActionIcon>
      </Tooltip>
    ) : null;

  return (
    <SidebarBase
      className="markups-list-sidebar"
      title={t("viewer.markupsList.title", "Markups")}
      icon={<LocalIcon icon="list-alt" width="1.1rem" height="1.1rem" />}
      rightOffset={rightOffset}
      visible={visible}
      onClose={toggleMarkupsListSidebar}
      closeLabel={t("viewer.markupsList.closeSidebar", "Close markups list")}
      headerActions={headerActions}
      searchTerm={searchTerm}
      searchPlaceholder={t(
        "viewer.markupsList.searchPlaceholder",
        "Search markups",
      )}
      onSearchChange={setSearchTerm}
    >
      {allRows.length === 0 ? (
        <Stack align="center" gap="sm" py="lg">
          <LocalIcon
            icon="list-alt"
            width="2rem"
            height="2rem"
            style={{ color: "var(--mantine-color-dimmed)" }}
          />
          <Text size="sm" c="dimmed" ta="center">
            {t(
              "viewer.markupsList.hint",
              "Every highlight, shape, and note you add will be listed here by page.",
            )}
          </Text>
        </Stack>
      ) : (
        <>
          <Select
            data={typeOptions}
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder={t("viewer.markupsList.allTypes", "All types")}
            clearable
            size="xs"
            mb="sm"
          />
          {filteredRows.length === 0 ? (
            <div className="sidebar-base__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                {t("viewer.markupsList.noMatch", "No markups match")}
              </Text>
            </div>
          ) : (
            pageNumbers.map((pageIndex) => {
              const rows = byPage[pageIndex] ?? [];
              return (
                <Box key={pageIndex} mb="md">
                  <Text size="sm" fw={700} mb={2}>
                    {t("viewer.comments.pageLabel", "Page {{page}}", {
                      page: pageIndex + 1,
                    })}
                  </Text>
                  <Text size="xs" c="dimmed" mb="sm">
                    {t("viewer.markupsList.nMarkups", "{{count}} markups", {
                      count: rows.length,
                    })}
                  </Text>
                  <Box
                    mb="xs"
                    style={{ borderBottom: "1px solid var(--c-border-subtle)" }}
                  />
                  <Stack gap="sm">
                    {rows.map(({ ann }) => {
                      const id = ann.id;
                      const color = getAnnotationColor(ann);
                      const content = (ann.contents ?? "").trim();
                      return (
                        <Box
                          key={id}
                          p="sm"
                          style={{
                            border: "1px solid var(--c-border-subtle)",
                            borderRadius: 8,
                            backgroundColor: "var(--c-surface-raised)",
                          }}
                        >
                          <Group
                            wrap="nowrap"
                            gap="xs"
                            justify="space-between"
                            align="flex-start"
                          >
                            <Group
                              wrap="nowrap"
                              gap="xs"
                              style={{ minWidth: 0, flex: 1 }}
                            >
                              <AnnotationTypeIcon ann={ann} />
                              <Box style={{ minWidth: 0 }}>
                                <Group gap={6} wrap="nowrap">
                                  <Text size="sm" fw={600}>
                                    {getAnnotationTypeLabel(ann, t)}
                                  </Text>
                                  {color && (
                                    <span
                                      title={color}
                                      style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: "50%",
                                        background: color,
                                        border:
                                          "1px solid var(--c-border-strong)",
                                        flexShrink: 0,
                                      }}
                                    />
                                  )}
                                </Group>
                                <Text size="xs" c="dimmed">
                                  {getAuthorName(ann, displayName)}
                                  {(() => {
                                    const date = formatAnnotationDate(ann);
                                    return date ? ` · ${date}` : "";
                                  })()}
                                </Text>
                              </Box>
                            </Group>
                            <Tooltip
                              label={t(
                                "viewer.comments.locateAnnotation",
                                "Locate in document",
                              )}
                            >
                              <ActionIcon
                                variant="tertiary"
                                accent="neutral"
                                size="sm"
                                aria-label={t(
                                  "viewer.comments.locateAnnotation",
                                  "Locate in document",
                                )}
                                onClick={() => handleLocate(pageIndex, ann)}
                              >
                                <VisibilityIcon style={{ fontSize: 16 }} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                          {content && (
                            <Text
                              size="sm"
                              mt="xs"
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {content}
                            </Text>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })
          )}
        </>
      )}
    </SidebarBase>
  );
}
