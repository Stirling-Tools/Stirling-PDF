import type { PdfAnnotationObject } from "@embedpdf/models";

export interface CommentCsvEntry {
  author: string;
  date: Date | null;
  text: string;
}

export interface CommentCsvThread {
  /** 1-based page number. */
  page: number;
  comment: CommentCsvEntry;
  replies: CommentCsvEntry[];
}

export interface CommentsCsvHeaders {
  page: string;
  thread: string;
  author: string;
  modified: string;
  comment: string;
  inReplyTo: string;
}

type CommentSourceObject = Pick<PdfAnnotationObject, "author" | "contents">;

type StoredDate = Date | number | string;

type CommentDateSource = Pick<PdfAnnotationObject, "modified" | "created"> & {
  modifiedDate?: StoredDate;
  creationDate?: StoredDate;
  M?: StoredDate;
  customData?: { modifiedDate?: StoredDate };
};

export interface CommentSourceEntry<
  T extends CommentSourceObject = CommentSourceObject,
> {
  annotation: { object: T };
  replies?: Array<{ object: T }>;
}

// Without it Excel reads the CSV in the system codepage and mangles non-ASCII text.
const EXCEL_UTF8_BOM = "﻿";

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * The text a comment card shows: the annotation's own contents, else its first
 * reply's, else "" for a comment that has not been posted yet.
 */
export function getCommentDisplayContent(entry: CommentSourceEntry): string {
  const main = entry.annotation?.object?.contents;
  if (main != null && String(main).trim()) return String(main).trim();
  const firstReply = entry.replies?.[0]?.object?.contents;
  if (firstReply != null && String(firstReply).trim())
    return String(firstReply).trim();
  return "";
}

/**
 * When a comment last changed: EmbedPDF's modified date, else its created date,
 * else a date stored under a PDF or custom-data key. Null when there is none or
 * it does not parse.
 */
export function getCommentDate(obj: CommentDateSource): Date | null {
  const raw =
    obj.modified ??
    obj.created ??
    obj.modifiedDate ??
    obj.creationDate ??
    obj.customData?.modifiedDate ??
    obj.M;
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * One RFC 4180 field. A leading formula character is prefixed with a quote so
 * spreadsheets show the text instead of evaluating it (CSV injection).
 */
export function toCsvCell(value: string): string {
  const stripped = value.replace(/^[ \t]+/, "");
  const safe =
    FORMULA_TRIGGERS.has(value.charAt(0)) ||
    FORMULA_TRIGGERS.has(stripped.charAt(0))
      ? `'${value}`
      : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsvEntry<T extends CommentSourceObject>(
  obj: T,
  getDate: (obj: T) => Date | null,
  text: string,
): CommentCsvEntry {
  return { author: (obj.author ?? "").trim(), date: getDate(obj), text };
}

/**
 * Threads in page order, then in the given order within a page, matching what
 * the sidebar shows: the comment text falls back to the first reply, and a
 * comment with no text yet is still being composed, so it is left out. Authors
 * are written as stored, without the sidebar's current-user substitution.
 */
export function toCommentCsvThreads<T extends CommentSourceObject>(
  byPageIndex: Record<number, CommentSourceEntry<T>[]>,
  getDate: (obj: T) => Date | null,
): CommentCsvThread[] {
  return Object.keys(byPageIndex)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((pageIndex) =>
      byPageIndex[pageIndex].flatMap((entry) => {
        const text = getCommentDisplayContent(entry);
        if (!text) return [];
        return [
          {
            page: pageIndex + 1,
            comment: toCsvEntry(entry.annotation.object, getDate, text),
            replies: (entry.replies ?? []).map((reply) =>
              toCsvEntry(
                reply.object,
                getDate,
                (reply.object.contents ?? "").trim(),
              ),
            ),
          },
        ];
      }),
    );
}

/**
 * One row per comment and per reply, numbered by thread in the given order,
 * prefixed with a UTF-8 BOM. Dates are ISO 8601 in UTC; a missing date is an
 * empty cell.
 */
export function buildCommentsCsv(
  headers: CommentsCsvHeaders,
  threads: CommentCsvThread[],
): string {
  const rows: string[][] = [
    [
      headers.page,
      headers.thread,
      headers.author,
      headers.modified,
      headers.comment,
      headers.inReplyTo,
    ],
  ];
  threads.forEach(({ page, comment, replies }, index) => {
    const row = (entry: CommentCsvEntry, inReplyTo: string) => [
      String(page),
      String(index + 1),
      entry.author,
      entry.date?.toISOString() ?? "",
      entry.text,
      inReplyTo,
    ];
    rows.push(row(comment, ""));
    for (const reply of replies) rows.push(row(reply, comment.author));
  });
  return (
    EXCEL_UTF8_BOM +
    rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n")
  );
}

export function commentsCsvFileName(pdfName: string): string {
  const base = pdfName.replace(/\.pdf$/i, "") || "document";
  return `${base}-comments.csv`;
}
