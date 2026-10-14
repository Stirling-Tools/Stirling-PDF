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
  date: string;
  comment: string;
  inReplyTo: string;
}

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * One RFC 4180 field. A leading formula character is prefixed with a quote so
 * spreadsheets show the text instead of evaluating it (CSV injection).
 */
export function toCsvCell(value: string): string {
  const safe = FORMULA_TRIGGERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * One row per comment and per reply, numbered by thread in the given order.
 * Dates are ISO 8601 in UTC; a missing date is an empty cell.
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
      headers.date,
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
  return rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n");
}

export function commentsCsvFileName(pdfName: string): string {
  const base = pdfName.replace(/\.pdf$/i, "") || "document";
  return `${base}-comments.csv`;
}
