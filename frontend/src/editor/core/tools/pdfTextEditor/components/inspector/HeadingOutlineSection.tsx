import { Group, Stack, Text } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import {
  type HeadingIssue,
  type HeadingOutline,
  type OutlineEntry,
} from "@editor/tools/pdfTextEditor/util/headingOutline";
import {
  headingTreeGuides,
  type TreeGuide,
} from "@editor/tools/pdfTextEditor/util/headingTree";
import "@editor/tools/pdfTextEditor/components/inspector/HeadingOutlineSection.css";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

/** The document's headings in reading order, each issue under the heading it belongs to; the caller titles it and counts the issues. */
export function HeadingOutlineSection({
  outline,
  onSelect,
}: {
  outline: HeadingOutline;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  const guides = headingTreeGuides(outline.entries.map((entry) => entry.level));
  return (
    <Stack
      gap={0}
      className="pdf-editor-heading-outline"
      data-testid="pdf-editor-heading-outline"
    >
      {outline.mixesNumbering && (
        <IssueText
          text={t(
            "pdfTextEditor.inspector.accessibility.outline.mixedNumbering",
            "Mixes numbered and unnumbered headings",
          )}
          testId="pdf-editor-heading-mixed"
        />
      )}
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
            guides={guides[index]}
            onSelect={() => onSelect(index)}
          />
        ))
      )}
    </Stack>
  );
}

function headingText({ run, range }: OutlineEntry): string {
  if (!run) return "";
  return range ? run.text.slice(range.start, range.end) : run.text;
}

function OutlineRow({
  entry,
  guides,
  onSelect,
}: {
  entry: OutlineEntry;
  guides: TreeGuide[];
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
    <div
      className="pdf-editor-heading-outline__row"
      data-testid="pdf-editor-heading-entry"
      data-level={entry.level ?? undefined}
    >
      {guides.map((guide, column) => (
        <span
          // Columns are positional: the same column is the same ancestor.
          key={column}
          className={`pdf-editor-heading-outline__guide pdf-editor-heading-outline__guide--${guide}`}
          aria-hidden
        />
      ))}
      <div className="pdf-editor-heading-outline__body">
        <button
          type="button"
          className="pdf-editor-heading-outline__entry"
          title={label}
          disabled={entry.pageIndex === null}
          onClick={onSelect}
        >
          <span
            className={`pdf-editor-heading-outline__label ${privateContentClassName}`}
          >
            {label}
          </span>
          <span className="pdf-editor-heading-outline__type">{entry.type}</span>
        </button>
        {entry.issue && (
          <IssueText
            text={issueText(t, entry.issue)}
            testId="pdf-editor-heading-issue"
          />
        )}
      </div>
    </div>
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
        {
          previous: issue.previous,
        },
      );
  }
}
