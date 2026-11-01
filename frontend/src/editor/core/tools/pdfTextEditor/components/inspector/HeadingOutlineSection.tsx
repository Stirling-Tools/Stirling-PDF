import { Box, Divider, Group, Stack, Text } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import {
  Section,
  SectionLabel,
  StatRow,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  issueCount,
  type HeadingIssue,
  type HeadingOutline,
  type OutlineEntry,
} from "@editor/tools/pdfTextEditor/util/headingOutline";
import "@editor/tools/pdfTextEditor/components/inspector/HeadingOutlineSection.css";

const INDENT_PX = 12;

/** The document's headings in reading order, each issue under the heading it belongs to. */
export function HeadingOutlineSection({
  outline,
  onSelect,
}: {
  outline: HeadingOutline;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-heading-outline">
      <SectionLabel>
        {t("pdfTextEditor.inspector.accessibility.outline.heading", "Headings")}
      </SectionLabel>
      <Stack gap={4}>
        <StatRow
          label={t(
            "pdfTextEditor.inspector.accessibility.outline.problems",
            "Heading problems",
          )}
          value={
            <span data-testid="pdf-editor-heading-problems">
              {issueCount(outline)}
            </span>
          }
        />
        {outline.mixesNumbering && (
          <IssueText
            text={t(
              "pdfTextEditor.inspector.accessibility.outline.mixedNumbering",
              "Mixes numbered and unnumbered headings",
            )}
            testId="pdf-editor-heading-mixed"
          />
        )}
        <Divider my={4} />
        {outline.entries.length === 0 ? (
          <Text size="xs" c="dimmed" data-testid="pdf-editor-heading-none">
            {t(
              "pdfTextEditor.inspector.accessibility.outline.none",
              "No headings",
            )}
          </Text>
        ) : (
          outline.entries.map((entry, index) => (
            <OutlineRow
              // Headings carry no identity of their own; their order is fixed for the read.
              key={index}
              entry={entry}
              onSelect={() => onSelect(index)}
            />
          ))
        )}
      </Stack>
    </Section>
  );
}

function headingText({ run, range }: OutlineEntry): string {
  if (!run) return "";
  return range ? run.text.slice(range.start, range.end) : run.text;
}

function OutlineRow({
  entry,
  onSelect,
}: {
  entry: OutlineEntry;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const label =
    headingText(entry).replace(/\s+/g, " ").trim() ||
    (entry.pageIndex === null
      ? t(
          "pdfTextEditor.inspector.accessibility.outline.empty",
          "Heading with no text",
        )
      : t(
          "pdfTextEditor.inspector.accessibility.outline.onPage",
          "Heading on page {{page}}",
          { page: entry.pageIndex + 1 },
        ));
  return (
    <Box
      pl={((entry.level ?? 1) - 1) * INDENT_PX}
      data-testid="pdf-editor-heading-entry"
      data-level={entry.level ?? undefined}
    >
      <button
        type="button"
        className="pdf-editor-heading-outline__entry"
        title={label}
        disabled={entry.pageIndex === null}
        onClick={onSelect}
      >
        {label}
      </button>
      {entry.issue && (
        <IssueText
          text={issueText(t, entry.issue)}
          testId="pdf-editor-heading-issue"
        />
      )}
    </Box>
  );
}

function IssueText({ text, testId }: { text: string; testId: string }) {
  return (
    <Group gap={4} wrap="nowrap" c="var(--c-warning)" data-testid={testId}>
      <Icon name="triangle-alert" size={14} style={{ flexShrink: 0 }} />
      <Text size="xs" c="var(--c-warning)">
        {text}
      </Text>
    </Group>
  );
}

function issueText(t: TFunction, issue: HeadingIssue): string {
  switch (issue.kind) {
    case "first-not-h1":
      return t(
        "pdfTextEditor.inspector.accessibility.outline.firstNotH1",
        "First heading should be Heading 1",
      );
    case "skipped-level":
      return t(
        "pdfTextEditor.inspector.accessibility.outline.skippedLevel",
        "Skips a level after Heading {{previous}}",
        { previous: issue.previous },
      );
  }
}
