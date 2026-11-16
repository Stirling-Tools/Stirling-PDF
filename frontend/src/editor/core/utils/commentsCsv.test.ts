// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildCommentsCsv,
  commentsCsvFileName,
  getCommentDate,
  toCommentCsvThreads,
  toCsvCell,
  type CommentsCsvHeaders,
} from "@editor/utils/commentsCsv";

const BOM = "﻿";

const HEADERS: CommentsCsvHeaders = {
  page: "Page",
  thread: "Thread",
  author: "Author",
  modified: "Last modified (UTC)",
  comment: "Comment",
  inReplyTo: "In reply to",
};

interface FakeAnnotation {
  author?: string;
  contents?: string;
  modified?: Date;
}

const dateOf = (obj: FakeAnnotation) => obj.modified ?? null;

function entry(comment: FakeAnnotation, replies: FakeAnnotation[] = []) {
  return {
    annotation: { object: comment },
    replies: replies.map((object) => ({ object })),
  };
}

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

  it("neutralises a formula hidden behind leading spaces or tabs", () => {
    expect(toCsvCell(" =1+1")).toBe("' =1+1");
    expect(toCsvCell("\t@cmd")).toBe("'\t@cmd");
  });

  it("neutralises a formula that also needs quoting", () => {
    expect(toCsvCell('=HYPERLINK("x","y")')).toBe(
      '"\'=HYPERLINK(""x"",""y"")"',
    );
  });
});

describe("getCommentDate", () => {
  const modified = new Date("2026-10-14T09:30:00Z");
  const created = new Date("2026-10-13T08:00:00Z");

  it("reads the modified date EmbedPDF gives an annotation", () => {
    expect(getCommentDate({ modified, created })).toBe(modified);
  });

  it("falls back to the created date", () => {
    expect(getCommentDate({ created })).toBe(created);
  });

  it("parses a date stored under a PDF key", () => {
    expect(getCommentDate({ M: "2026-10-14T09:30:00Z" })).toEqual(modified);
  });

  it("is null when there is no date or it does not parse", () => {
    expect(getCommentDate({})).toBeNull();
    expect(getCommentDate({ modifiedDate: "not a date" })).toBeNull();
  });
});

describe("toCommentCsvThreads", () => {
  it("orders pages numerically and numbers pages from 1", () => {
    const threads = toCommentCsvThreads(
      {
        10: [entry({ author: "Ann", contents: "Late" })],
        2: [entry({ author: "Bob", contents: "Early" })],
      },
      dateOf,
    );
    expect(threads.map((t) => [t.page, t.comment.text])).toEqual([
      [3, "Early"],
      [11, "Late"],
    ]);
  });

  it("leaves out comments that have not been posted", () => {
    const threads = toCommentCsvThreads(
      {
        0: [
          entry({ author: "Ann", contents: "  " }),
          entry({ contents: "Kept" }),
        ],
      },
      dateOf,
    );
    expect(threads.map((t) => t.comment.text)).toEqual(["Kept"]);
  });

  it("falls back to the first reply's text, as the sidebar does", () => {
    const [thread] = toCommentCsvThreads(
      { 0: [entry({ author: "Ann" }, [{ author: "Bob", contents: "Reply" }])] },
      dateOf,
    );
    expect(thread.comment).toEqual({
      author: "Ann",
      date: null,
      text: "Reply",
    });
    expect(thread.replies).toEqual([
      { author: "Bob", date: null, text: "Reply" },
    ]);
  });

  it("writes authors as stored, including placeholders", () => {
    const [thread] = toCommentCsvThreads(
      {
        0: [entry({ author: " Guest ", contents: "Hi" }, [{ contents: "Yo" }])],
      },
      dateOf,
    );
    expect(thread.comment.author).toBe("Guest");
    expect(thread.replies[0].author).toBe("");
  });

  it("takes dates from the given accessor", () => {
    const modified = new Date("2026-03-11T18:05:00Z");
    const [thread] = toCommentCsvThreads(
      { 0: [entry({ contents: "Hi", modified })] },
      dateOf,
    );
    expect(thread.comment.date).toBe(modified);
  });
});

describe("buildCommentsCsv", () => {
  it("writes a BOM and header, then each comment followed by its replies", () => {
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
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(BOM.length).split("\r\n")).toEqual([
      "Page,Thread,Author,Last modified (UTC),Comment,In reply to",
      "1,1,Ann,2026-03-11T18:05:00.000Z,Check this,",
      '1,1,Bob,,"Done, thanks",Ann',
      "3,2,Bob,,Typo,",
    ]);
  });

  it("writes only the header when there are no comments", () => {
    expect(buildCommentsCsv(HEADERS, [])).toBe(
      `${BOM}Page,Thread,Author,Last modified (UTC),Comment,In reply to`,
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
