import React from "react";

const MARK_STYLE: React.CSSProperties = {
  background: "var(--mantine-color-yellow-3)",
  color: "var(--mantine-color-dark-9)",
  borderRadius: 2,
  padding: 0,
};

/** Wraps every case-insensitive occurrence of query so virtualized rows show why they matched. */
export function highlightMatches(text: string, query: string): React.ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;

  const haystack = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = haystack.indexOf(needle, from);

  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} style={MARK_STYLE}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = haystack.indexOf(needle, from);
  }

  if (from < text.length) parts.push(text.slice(from));
  return parts.length > 0 ? parts : text;
}

/** Row indexes (in display order) with at least one cell containing the query. */
export function findCsvMatches(
  rows: readonly (readonly string[])[],
  query: string,
): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: number[] = [];
  rows.forEach((row, index) => {
    if (row.some((cell) => cell.toLowerCase().includes(needle))) {
      matches.push(index);
    }
  });
  return matches;
}
