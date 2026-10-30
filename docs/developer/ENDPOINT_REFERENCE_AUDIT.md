# Endpoint reference audit

The generated OpenAPI document exposes 103 tool endpoints. Three are certificate helpers with no
document input. The remaining 100 accept multipart requests and were exercised in both upload and
storage-reference mode, for 195 calls.

## Coverage

| Result | Count |
|---|---:|
| Endpoints audited | 103 |
| Multipart tool endpoints | 100 |
| Accept `fileId` or `fileIds` | 95 |
| Return 2xx in both modes | 83 |

Five multipart endpoints do not accept a document reference:

- `purview-read-label`, `purview-apply-label`, and `external-api-call` receive the file from a
  pipeline connection.
- `ai/tools/classify-and-label` is disabled without an AI provider.
- `convert/url/pdf` has no file input.

## Aggregate transfer

| Metric | Reference | Upload |
|---|---:|---:|
| Upstream bytes | 55,049 | 10,927,896 |
| Ratio | | 198.5x |

The upload total is dominated by five attachment endpoints using a 2 MB fixture. Their reference
calls send 136 to 339 bytes; their upload calls send 2.1 MB each.

## Expected failures

These return the same status in both modes and are not reference-transport failures:

- Missing local models or providers: `form-detection` 403, `ai/tools/classify-and-label` 503,
  `docparse/ingest` 503.
- Disabled converters: `pdf/epub`, `ebook/pdf`, and `url/pdf` 403.
- Missing external binaries or fixtures: `markdown/pdf`, `html/pdf`, `eml/pdf`, `cert-sign`,
  `remove-password`, `redact-execute`, `batch-process-attachments`, and the integration endpoints.
- `validate-compliance` returns 200 for a conforming PDF and 422 for a non-conforming one.

## Method

Each endpoint was called with the same fixture and parameters twice, once with `fileInput` and once
with `fileId` or `fileIds`. Status, upstream bytes, and downstream bytes were recorded per call.
The numbers above are the aggregate of those calls.
