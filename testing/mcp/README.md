# MCP conformance and correctness harness

Checks a running Stirling PDF `/mcp` endpoint with the official MCP clients. Every script prints `PASS`/`FAIL`/`SKIP` lines and exits non-zero on any failure. For setting up a server that ChatGPT and Claude can reach, see [docs/mcp-chat-apps.md](../../docs/mcp-chat-apps.md).

| Script | Client | Covers |
| --- | --- | --- |
| `protocol.mjs` | raw `fetch` | 2026-07-28 rules (`server/discover`, per-request `_meta`, `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name` checks and error codes), MRTR `input_required` round trip, legacy `initialize` |
| `sdk-v1.mjs` | `@modelcontextprotocol/sdk` 1.32.1 | schema-valid tool list, upload, chained operations, download, result links, attachment refusals, MCP Apps widget |
| `eras.mjs` | `@modelcontextprotocol/client` 2.3.1 | legacy, pinned 2026-07-28 and auto negotiation; password forms accepted, declined and unsupported |
| `run-all.mjs` | - | the three above in turn |
| `correctness.mjs` | `@modelcontextprotocol/sdk` 1.32.1 | operation outputs are right, not just present; see [Output correctness](#output-correctness) |
| `oauth_chain.py` | Python stdlib | the OAuth chain ChatGPT and Claude walk: 401, PRM, AS metadata, DCR, sign-in, token, MCP calls |

## Run

```bash
cd testing/mcp
npm ci
MCP_URL=http://localhost:8080/mcp MCP_API_KEY=<a Stirling API key> npm test
```

Options can also be passed as flags: `node run-all.mjs --url https://pdf.example.com --api-key <key> --pdf other.pdf`. Prefer the environment for keys so they stay out of the process list.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_URL` | `http://localhost:8080/mcp` | Base URL or `/mcp` URL |
| `MCP_API_KEY` | - | Sent as `X-API-KEY` (server in `mcp.auth.mode: apikey`) |
| `MCP_BEARER` | - | OAuth access token, used when no API key is set |
| `MCP_SAMPLE_PDF` | `app/common/src/test/resources/example.pdf` | Input PDF; keep it small, inline files count towards `mcp.maxRequestBytes` |
| `MCP_EXPECT_LINKS` | `any` | `private`, `public` or `off` to assert the server's `mcp.downloadLinks`; `any` checks whatever comes back |

Private links are checked both ways: anonymous download must be refused, and a signed-in download (with the API key) must work. With `MCP_BEARER` the signed-in half is skipped, since an MCP OAuth token is not a Stirling session.

The OAuth chain needs an IdP with dynamic client registration and an account bound to a Stirling user:

```bash
MCP_OAUTH_USERNAME=<user> MCP_OAUTH_PASSWORD=<password> python -I oauth_chain.py https://pdf.example.com
```

## Output correctness

`correctness.mjs` uploads generated fixtures, runs each operation over MCP, downloads the result with `stirling_download` and inspects it with `pdf-lib` and `pdf.js`. It needs the same `MCP_URL` and `MCP_API_KEY` as the other scripts:

```bash
MCP_URL=http://localhost:8080/mcp MCP_API_KEY=<key> npm run correctness
```

`fixtures.mjs` builds the inputs in memory on every run, so no binaries are committed; `node fixtures.mjs <dir>` writes them out for a look. The scanned page for OCR is drawn with `@napi-rs/canvas` (installed with `pdfjs-dist`); without it the OCR check is skipped.

| Check | Passes when |
| --- | --- |
| `rotate-pdf` | every page gains `/Rotate 90`, page order unchanged; the outline survives a rotation |
| `remove-pages`, `rearrange-pages` | the page labels read back in the expected order (custom and reverse) |
| `merge-pdfs` | page count is the sum of the inputs and their pages stay in order |
| `split-pages`, `split-pdf-by-chapters` | the ZIP parts hold exactly the expected pages or chapters |
| `scale-pages` (`KEEP`) | each page keeps its own size on a mixed A4 and Letter file |
| `add-watermark`, `add-stamp` | the text is in the page content and the original text is kept |
| `auto-redact` | the secret is absent from extracted text and from every decoded content stream (literal, hex and UTF-16 forms), other text kept; a token that is still extractable is reported as only visually covered |
| `ocr-pdf` | an image-only page gains the expected words (case and punctuation ignored) |
| `compress-pdf` | an image-heavy file does not grow and stays readable |
| `flatten` | form fields are gone and the filled value is page text |
| `pdf-to-text`, `pdf-to-markdown` | the output holds the document's words |
| `pdf-to-xlsx` | a valid workbook whose sheets hold the table's cells |
| `pdf-to-word` | a valid `.docx` whose `word/document.xml` holds the words |
| `add-password` | the output is encrypted, will not open without the password and opens with it |
| `get-info-on-pdf`, `extract-bookmarks`, `validate-compliance` | the report gives the right page count and bookmark titles, and calls a plain PDF non-compliant |
| `stirling_run_pipeline` | rotate then compress returns a rotated file with its content intact |

Operations the server does not list (for example `ocr-pdf` without tesseract and OCRmyPDF, or office conversions without LibreOffice) are reported as `SKIP` with the reason. Redaction runs last, so a crash there cannot hide other results. The suite waits out `mcp.rateLimitPerMinute` and polls slow jobs through `stirling_job_status`.

## In the compose suites

- `testing/compose/validate-mcp-apikey.sh` mints a key and runs `run-all.mjs` against the Keycloak MCP stack in apikey mode (`task e2e:mcp:validate-apikey`).
- `task e2e:mcp:conformance` runs it against any server; set `MCP_URL` and `MCP_API_KEY` first.
- `task e2e:mcp:correctness` runs `correctness.mjs` the same way.
- `testing/cucumber/features/multinode/mcp.feature` covers results across nodes on the multi-node stack.
