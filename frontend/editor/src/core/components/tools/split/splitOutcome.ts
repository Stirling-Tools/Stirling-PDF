import { SPLIT_METHODS, type SplitMethod } from "@app/constants/splitConstants";
import type { SplitParameters } from "@app/hooks/tools/split/useSplitParameters";

/**
 * What the configured split will produce, computed from the parameters and the
 * page count so the settings step can promise an outcome before the run.
 * Pure: no i18n, no React — the component turns this into a sentence.
 * Counts of 0 mean "not knowable before the run", never "no files".
 */
export type SplitOutcome =
  | { kind: "none" }
  | { kind: "invalid-pages"; token: string }
  | { kind: "invalid-page-out-of-range"; page: number; totalPages: number }
  | { kind: "invalid-value" }
  | { kind: "parts"; files: number; breaks: number[] }
  | {
      kind: "uniform";
      files: number;
      pagesPerFile: number;
      lastFilePages: number;
    }
  | { kind: "even"; files: number; distribution: number[] }
  | { kind: "by-size"; size: string }
  | { kind: "chapters"; level: number }
  | { kind: "divider" }
  | {
      kind: "pieces";
      files: number;
      piecesPerPage: number;
      rows: number;
      columns: number;
      cutPages: number;
      totalPages: number;
      merged: boolean;
    }
  | {
      kind: "poster";
      files: number;
      tilesPerPage: number;
      rows: number;
      columns: number;
      pageSize: string;
    };

const SIZE_PATTERN = /^(\d+(?:[.,]\d+)?)\s*(B|KB|MB|GB)?$/i;

export type PageSelection =
  | { ok: true; pages: number[] }
  | { ok: false; reason: "empty" | "token" | "out-of-range"; value?: string };

/**
 * Parses `1,3,5-9` / `all` into the 1-based pages it names.
 * Ranges include both ends. Anything else — the `2n+1` expressions the API
 * accepts — is reported as unparseable rather than guessed at.
 */
export function parsePageSelection(
  input: string,
  totalPages: number,
): PageSelection {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (/^all$/i.test(text)) {
    return { ok: true, pages: range(1, totalPages) };
  }

  const pages = new Set<number>();
  for (const rawToken of text.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      if (from < 1 || to < from)
        return { ok: false, reason: "token", value: token };
      if (to > totalPages) {
        return { ok: false, reason: "out-of-range", value: token };
      }
      for (const page of range(from, to)) pages.add(page);
      continue;
    }

    if (!/^\d+$/.test(token)) {
      return { ok: false, reason: "token", value: token };
    }
    const page = Number(token);
    if (page < 1) return { ok: false, reason: "token", value: token };
    if (page > totalPages) {
      return { ok: false, reason: "out-of-range", value: token };
    }
    pages.add(page);
  }

  if (pages.size === 0) return { ok: false, reason: "empty" };
  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}

/** Pages the sections method cuts, mirroring the backend's splitMode. */
export function pagesCutBySections(
  splitMode: string | undefined,
  customPages: string | undefined,
  totalPages: number,
): number[] {
  switch (splitMode ?? "SPLIT_ALL") {
    case "SPLIT_ALL_EXCEPT_FIRST":
      return range(2, totalPages);
    case "SPLIT_ALL_EXCEPT_LAST":
      return range(1, totalPages - 1);
    case "SPLIT_ALL_EXCEPT_FIRST_AND_LAST":
      return range(2, totalPages - 1);
    case "CUSTOM": {
      const parsed = parsePageSelection(customPages ?? "", totalPages);
      return parsed.ok ? parsed.pages : [];
    }
    default:
      return range(1, totalPages);
  }
}

function range(from: number, to: number): number[] {
  if (to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function positiveInt(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
}

/** Splits `total` pages into `files` groups the way the backend distributes them. */
function distribute(total: number, files: number): number[] {
  const base = Math.floor(total / files);
  const remainder = total % files;
  return Array.from({ length: files }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
}

export function computeSplitOutcome(
  parameters: SplitParameters,
  totalPages: number | null,
): SplitOutcome {
  const method: SplitMethod | null = parameters.method;
  if (!method) return { kind: "none" };
  const pages = totalPages && totalPages > 0 ? totalPages : null;

  switch (method) {
    case SPLIT_METHODS.BY_PAGES: {
      if (!parameters.pages.trim()) return { kind: "none" };
      if (!pages) return { kind: "parts", files: 0, breaks: [] };
      const parsed = parsePageSelection(parameters.pages, pages);
      if (!parsed.ok) {
        if (parsed.reason === "out-of-range") {
          return {
            kind: "invalid-page-out-of-range",
            page: Number(parsed.value),
            totalPages: pages,
          };
        }
        return {
          kind: "invalid-pages",
          token: parsed.value ?? parameters.pages,
        };
      }
      // A cut after the last page produces nothing, so it is not a break.
      const breaks = parsed.pages.filter((page) => page < pages);
      return {
        kind: "parts",
        files: breaks.length + 1,
        breaks,
      };
    }

    case SPLIT_METHODS.BY_PAGE_COUNT: {
      if (!parameters.splitValue.trim()) return { kind: "none" };
      const perFile = positiveInt(parameters.splitValue);
      if (!perFile) return { kind: "invalid-value" };
      if (!pages) {
        return {
          kind: "uniform",
          files: 0,
          pagesPerFile: perFile,
          lastFilePages: perFile,
        };
      }
      const files = Math.ceil(pages / perFile);
      const lastFilePages = pages - (files - 1) * perFile;
      return { kind: "uniform", files, pagesPerFile: perFile, lastFilePages };
    }

    case SPLIT_METHODS.BY_DOC_COUNT: {
      if (!parameters.splitValue.trim()) return { kind: "none" };
      const requested = positiveInt(parameters.splitValue);
      if (!requested) return { kind: "invalid-value" };
      if (!pages) return { kind: "even", files: requested, distribution: [] };
      const files = Math.min(requested, pages);
      return { kind: "even", files, distribution: distribute(pages, files) };
    }

    case SPLIT_METHODS.BY_SIZE: {
      const value = parameters.splitValue.trim();
      if (!value) return { kind: "none" };
      if (!SIZE_PATTERN.test(value)) return { kind: "invalid-value" };
      return { kind: "by-size", size: value.toUpperCase() };
    }

    case SPLIT_METHODS.BY_CHAPTERS: {
      const level = positiveInt(parameters.bookmarkLevel);
      return { kind: "chapters", level: level ?? 1 };
    }

    case SPLIT_METHODS.BY_PAGE_DIVIDER:
      return { kind: "divider" };

    case SPLIT_METHODS.BY_SECTIONS: {
      if (
        parameters.splitMode === "CUSTOM" &&
        !(parameters.customPages ?? "").trim()
      ) {
        return { kind: "none" };
      }
      const rows = (positiveInt(parameters.hDiv) ?? 2) + 1;
      const columns = (positiveInt(parameters.vDiv) ?? 2) + 1;
      const piecesPerPage = rows * columns;
      if (!pages) {
        return {
          kind: "pieces",
          files: 0,
          piecesPerPage,
          rows,
          columns,
          cutPages: 0,
          totalPages: 0,
          merged: parameters.merge,
        };
      }
      const cutPages = pagesCutBySections(
        parameters.splitMode,
        parameters.customPages,
        pages,
      ).length;
      const files = parameters.merge
        ? 1
        : cutPages * piecesPerPage + (pages - cutPages);
      return {
        kind: "pieces",
        files,
        piecesPerPage,
        rows,
        columns,
        cutPages,
        totalPages: pages,
        merged: parameters.merge,
      };
    }

    case SPLIT_METHODS.BY_POSTER: {
      const rows = positiveInt(parameters.yFactor) ?? 2;
      const columns = positiveInt(parameters.xFactor) ?? 2;
      const tilesPerPage = rows * columns;
      return {
        kind: "poster",
        files: pages ? pages * tilesPerPage : 0,
        tilesPerPage,
        rows,
        columns,
        pageSize: parameters.pageSize || "A4",
      };
    }

    default:
      return { kind: "none" };
  }
}
