## Bulk Selection Expressions

### What this does

- Lets you select pages using compact expressions instead of typing long CSV lists.
- Your input expression is preserved exactly as typed; we only expand it under the hood into concrete page numbers based on the current document's page count.
- The final selection is always deduplicated, clamped to valid page numbers, and sorted ascending.

### Basic forms

- Numbers: `5` selects page 5.
- Ranges: `3-7` selects pages 3,4,5,6,7 (inclusive). If the start is greater than the end, it is swapped automatically (e.g., `7-3` → `3-7`).
- Lists (OR): `1,3-5,10` selects pages 1,3,4,5,10.

You can still use the original CSV format. For example, `1,2,3,4,5` (first five pages) continues to work.

### Logical operators

- OR (union): `,` or `|` or the word `or`
- AND (intersection): `&` or the word `and`
- NOT (complement within 1..max): `!term` or `!(group)` or the word `not term` / `not (group)`

Operator precedence (from highest to lowest):
1) `!` (NOT)
2) `&` / `and` (AND)
3) `,` / `|` / `or` (OR)

Use parentheses `(...)` to override precedence where needed.

### Keywords and progressions

- Keywords (case-insensitive):
  - `even`: all even pages (2, 4, 6, ...)
  - `odd`: all odd pages (1, 3, 5, ...)

- Arithmetic progressions: `k n ± c`, e.g. `2n`, `3n+1`, `4n-1`
  - `n` starts at 0 (CSS-style: `:nth-child`), then increases by 1 (n = 0,1,2,...). Non-positive results are discarded.
  - `k` must be a positive integer (≥ 1). `c` can be any integer (including negative).
  - Examples:
    - `2n` → 0,2,4,6,... → becomes 2,4,6,... after discarding non-positive
    - `2n-1` → -1,1,3,5,... → becomes 1,3,5,... (odd)
    - `3n+1` → 1,4,7,10,13,...

All selections are automatically limited to the current document's valid page numbers `[1..maxPages]`.

### Parentheses

- Group with parentheses to control evaluation order and combine NOT with groups.
- Examples:
  - `1-10 & (even, 15)` → even pages 2,4,6,8,10 (15 is outside 1-10)
  - `!(1-5, odd)` → remove pages 1..5 and all odd pages; for a 10-page doc this yields 6,8,10
  - `!(10-20 & !2n)` → complement of odd pages from 11..19 inside 10..20
  - `(2n | 3n+1) & 1-20` → union of even numbers and 3n+1 numbers, intersected with 1..20

### Whitespace and case

- Whitespace is ignored: `  odd  & 1 - 7` is valid.
- Keywords are case-insensitive: `ODD`, `Odd`, `odd` all work.

### Universe, clamping, deduplication

- The selection universe is the document's pages `[1..maxPages]`.
- Numbers outside the universe are discarded.
- Ranges are clamped to `[1..maxPages]` (e.g., `0-5` → `1-5`, `9-999` in a 10-page doc → `9-10`).
- Duplicates are removed; the final result is sorted ascending.

### Examples

- `1-10 & 2n & !5-7` → 2,4,8,10
- `odd` → 1,3,5,7,9,...
- `even` → 2,4,6,8,10,...
- `2n-1` → 1,3,5,7,9,...
- `3n+1` → 4,7,10,13,16,... (up to max pages)
- `1-3, 8-9` → 1,2,3,8,9
- `1-2 | 9-10 or 5` → 1,2,5,9,10
- `!(1-5)` → remove the first five pages from the universe
- `!(10-20 & !2n)` → complement of odd pages between 10 and 20
