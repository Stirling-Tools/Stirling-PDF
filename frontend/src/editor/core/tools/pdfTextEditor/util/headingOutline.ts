import {
  headingLevel,
  type HeadingType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import type {
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";

/** A heading as the document has it now: the file's, the session's retags applied. */
export interface DocumentHeading {
  type: HeadingType;
  /** The first page drawing its text; null when it draws none. */
  pageIndex: number | null;
  /** Its MCIDs on that page. */
  mcids: number[];
}

/**
 * What a checker reports against one heading (ISO 14289-1 7.4.2, Matterhorn
 * checkpoints 14-002 and 14-003). Moving back up any number of levels is
 * allowed; only going deeper may not skip one.
 */
export type HeadingIssue =
  | { kind: "first-not-h1" }
  | { kind: "skipped-level"; previous: number };

export interface OutlineEntry {
  type: HeadingType;
  /** Null for H, which has no number. */
  level: number | null;
  pageIndex: number | null;
  /** The run showing the heading; null until its page has been read, or when it draws no text. */
  run: TextRunSnapshot | null;
  issue: HeadingIssue | null;
}

export interface HeadingOutline {
  entries: OutlineEntry[];
  /** H alongside H1-H6, which ISO 14289-1 7.4.4 forbids (Matterhorn 14-007). */
  mixesNumbering: boolean;
}

/**
 * The headings in reading order, each with the run showing it and the issue
 * a checker would report. `pages` supplies the runs.
 */
export function headingOutline(
  headings: readonly DocumentHeading[],
  pages: readonly PageSnapshot[],
): HeadingOutline {
  let previous: number | null = null;
  const entries = headings.map((heading): OutlineEntry => {
    const level = headingLevel(heading.type);
    const entry = {
      type: heading.type,
      level,
      pageIndex: heading.pageIndex,
      run: runShowing(heading, pages),
      issue: null,
    };
    if (level === null) return entry;
    const issue = issueAt(level, previous);
    previous = level;
    return { ...entry, issue };
  });
  const unnumbered = entries.some((entry) => entry.level === null);
  const numbered = entries.some((entry) => entry.level !== null);
  return { entries, mixesNumbering: unnumbered && numbered };
}

function issueAt(level: number, previous: number | null): HeadingIssue | null {
  if (previous === null) return level === 1 ? null : { kind: "first-not-h1" };
  return level > previous + 1 ? { kind: "skipped-level", previous } : null;
}

function runShowing(
  heading: DocumentHeading,
  pages: readonly PageSnapshot[],
): TextRunSnapshot | null {
  if (heading.pageIndex === null) return null;
  const runs = pages.find((p) => p.pageIndex === heading.pageIndex)?.runs;
  return (
    runs?.find(
      (run) => run.mcid !== undefined && heading.mcids.includes(run.mcid),
    ) ?? null
  );
}

/** Headings carrying an issue, the document-wide mixed numbering counted once. */
export function issueCount(outline: HeadingOutline): number {
  const perHeading = outline.entries.filter((entry) => entry.issue).length;
  return perHeading + (outline.mixesNumbering ? 1 : 0);
}
