import { Box, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

interface PageListPanelProps {
  pages: PageSnapshot[];
}

/**
 * Compact list of the document's pages in the sidebar. Each row shows
 * the page number; clicking scrolls the matching `[data-testid="v2-page-N"]`
 * element into view. For documents with many pages this is the primary
 * way to jump around without manually scrolling through every page.
 */
export function PageListPanel({ pages }: PageListPanelProps) {
  if (pages.length === 0) return null;
  return (
    <Stack gap={4} data-testid="v2-page-list">
      <Text size="xs" fw={500} c="dimmed">
        Pages ({pages.length})
      </Text>
      <ScrollArea h={260} type="auto">
        <Stack gap={2}>
          {pages.map((page) => (
            <UnstyledButton
              key={page.pageIndex}
              onClick={() => {
                const el = document.querySelector<HTMLElement>(
                  `[data-testid="v2-page-${page.pageIndex}"]`,
                );
                el?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
              data-testid={`v2-page-list-${page.pageIndex}`}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              className="v2-page-list-item"
            >
              <Box>Page {page.pageIndex + 1}</Box>
              {page.dirty && (
                <Box
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#2c7be5",
                  }}
                  title="Has unsaved edits"
                />
              )}
            </UnstyledButton>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
