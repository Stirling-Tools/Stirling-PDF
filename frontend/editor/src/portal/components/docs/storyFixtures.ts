/**
 * Shared fixtures for the Developer Docs component stories.
 *
 * The search and TOC stories run their input through the real `searchDocs` and
 * `extractHeadings`, rather than hand-writing highlighted segments and heading
 * slugs. Hand-written fixtures would keep rendering happily after a change to
 * ranking, snippet windows or slug de-duping; driving the real functions means
 * the stories track them.
 */
import { extractHeadings } from "@portal/docs/headings";
import { searchDocs, toPlainText, type SearchDoc } from "@portal/docs/search";

/** A doc with every block the renderer special-cases: headings, a fenced code
 *  sample (copy button), a GFM table, a list, and an internal `doc:` link. */
export const SAMPLE_MARKDOWN = `# Uploading a document

The upload endpoint accepts a single PDF per request. See
[authentication](doc:auth-tokens) for how to obtain a token.

## Request

Send a \`multipart/form-data\` body with the file under \`document\`.

\`\`\`bash
curl -X POST https://api.example.com/v1/documents \\
  -H "Authorization: Bearer $TOKEN" \\
  -F document=@contract.pdf
\`\`\`

### Size limits

| Plan       | Max file size | Requests / min |
| ---------- | ------------- | -------------- |
| Free       | 10 MB         | 30             |
| Pro        | 100 MB        | 600            |
| Enterprise | Negotiated    | Custom         |

## Response

A successful upload returns the stored document:

- \`id\` — stable identifier for later calls
- \`status\` — \`queued\` until processing finishes
- \`pages\` — page count, once known

## Errors

Uploads fail when the file is not a PDF, exceeds the plan limit, or the token
has expired.
`;

/** A short doc, for the "barely any headings" TOC case. */
export const SHORT_MARKDOWN = `# Webhooks

Register an endpoint and we POST to it when a document finishes processing.

## Retries

Failed deliveries retry with backoff for 24 hours.
`;

export const SAMPLE_HEADINGS = extractHeadings(SAMPLE_MARKDOWN);
export const SHORT_HEADINGS = extractHeadings(SHORT_MARKDOWN);

/** A small corpus, indexed the way the docs view indexes real content. */
export const SEARCH_CORPUS: SearchDoc[] = [
  {
    id: "upload-document",
    title: "Uploading a document",
    sectionLabel: "Documents",
    text: toPlainText(SAMPLE_MARKDOWN),
  },
  {
    id: "webhooks",
    title: "Webhooks",
    sectionLabel: "Events",
    text: toPlainText(SHORT_MARKDOWN),
  },
  {
    id: "auth-tokens",
    title: "Authentication tokens",
    sectionLabel: "Getting started",
    text: toPlainText(
      "Create a token in the portal and send it as a Bearer header. " +
        "Tokens are scoped per environment and can be revoked at any time.",
    ),
  },
];

/** Results for a query, ranked and highlighted by the real search. */
export function resultsFor(query: string) {
  return searchDocs(SEARCH_CORPUS, query);
}
