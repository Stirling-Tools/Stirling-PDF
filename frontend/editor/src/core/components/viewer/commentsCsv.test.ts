// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildCommentsCsv,
  commentsCsvFileName,
  toCsvCell,
  type CommentsCsvHeaders,
} from "@app/components/viewer/commentsCsv";

const HEADERS: CommentsCsvHeaders = {
  page: "Page",
  thread: "Thread",
  author: "Author",
  date: "Date",
  comment: "Comment",
  inReplyTo: "In reply to",
};

describe("toCsvCell", () => {
  it("leaves plain text unquoted", () => {
    expect(toCsvCell("hello world")).toBe("hello world");
  });

  it("quotes fields with commas, quotes or newlines and doubles inner quotes", () => {
    expect(toCsvCell("a,b")).toBe('"a,b"');
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(toCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(toCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx"])(
    "neutralises a leading formula character in %j",
    (value) => {
      expect(toCsvCell(value)).toBe(`'${value}`);
    },
  );

  it("neutralises and quotes a leading carriage return", () => {
    expect(toCsvCell("\r=1")).toBe('"\'\r=1"');
  });

  it("neutralises a formula that also needs quoting", () => {
    expect(toCsvCell('=HYPERLINK("x","y")')).toBe(
      '"\'=HYPERLINK(""x"",""y"")"',
    );
  });
});

describe("buildCommentsCsv", () => {
  it("writes a header, then each comment followed by its replies", () => {
    const csv = buildCommentsCsv(HEADERS, [
      {
        page: 1,
        comment: {
          author: "Ann",
          date: new Date("2026-03-11T18:05:00Z"),
          text: "Check this",
        },
        replies: [{ author: "Bob", date: null, text: "Done, thanks" }],
      },
      {
        page: 3,
        comment: { author: "Bob", date: null, text: "Typo" },
        replies: [],
      },
    ]);
    expect(csv.split("\r\n")).toEqual([
      "Page,Thread,Author,Date,Comment,In reply to",
      "1,1,Ann,2026-03-11T18:05:00.000Z,Check this,",
      '1,1,Bob,,"Done, thanks",Ann',
      "3,2,Bob,,Typo,",
    ]);
  });

  it("writes only the header when there are no comments", () => {
    expect(buildCommentsCsv(HEADERS, [])).toBe(
      "Page,Thread,Author,Date,Comment,In reply to",
    );
  });
});

describe("commentsCsvFileName", () => {
  it("replaces the pdf extension", () => {
    expect(commentsCsvFileName("Report.PDF")).toBe("Report-comments.csv");
  });

  it("keeps names without a pdf extension", () => {
    expect(commentsCsvFileName("scan.v2")).toBe("scan.v2-comments.csv");
  });

  it("falls back when the name is empty", () => {
    expect(commentsCsvFileName("")).toBe("document-comments.csv");
  });
});
