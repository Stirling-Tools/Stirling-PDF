import {
  headingLevel,
  type HeadingType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import type {
  PageSnapshot,
  TextRange,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";

/** A heading as the document has it now: the file's, the session's retags applied. */
export interface DocumentHeading {
  type: HeadingType;
  /** The first page drawing its text; null when it draws none. */
  pageIndex: number | null;
  /** Its MCIDs on that page. */
  mcids: number[];
  /** Set when its text was cut from a run's: MCIDs that run likely carries. */
  partOf?: number[];
}

/** Where a heading whose text is part of a run's is shown. */
export interface HeadingText {
  runId: string;
  range: TextRange;
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
  /** The part of the run's text that is the heading's; null for all of it. */
  range: TextRange | null;
  issue: HeadingIssue | null;
}

export interface HeadingOutline {
  entries: OutlineEntry[];
  /** H alongside H1-H6, which ISO 14289-1 7.4.4 forbids (Matterhorn 14-007). */
  mixesNumbering: boolean;
}

/**
 * The headings in reading order, each with the run showing it and the issue
 * a checker would report. `pages` supplies the runs, and `locate` finds a
 * heading set `partOf` within them.
 */
export function headingOutline(
  headings: readonly DocumentHeading[],
  pages: readonly PageSnapshot[],
  locate: (heading: DocumentHeading) => HeadingText | null = () => null,
): HeadingOutline {
  let previous: number | null = null;
  const entries = headings.map((heading): OutlineEntry => {
    const level = headingLevel(heading.type);
    const entry = {
      type: heading.type,
      level,
      pageIndex: heading.pageIndex,
      ...runShowing(heading, pages, locate),
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
  locate: (heading: DocumentHeading) => HeadingText | null,
): { run: TextRunSnapshot | null; range: TextRange | null } {
  const runs =
    heading.pageIndex === null
      ? undefined
      : pages.find((p) => p.pageIndex === heading.pageIndex)?.runs;
  if (!runs) return { run: null, range: null };
  const text = heading.partOf ? locate(heading) : null;
  if (text) {
    const run = runs.find((r) => r.id === text.runId) ?? null;
    return { run, range: run && text.range };
  }
  const run = runs.find(
    (r) => r.mcid !== undefined && heading.mcids.includes(r.mcid),
  );
  return { run: run ?? null, range: null };
}

/** Headings carrying an issue, the document-wide mixed numbering counted once. */
export function issueCount(outline: HeadingOutline): number {
  const perHeading = outline.entries.filter((entry) => entry.issue).length;
  return perHeading + (outline.mixesNumbering ? 1 : 0);
}
