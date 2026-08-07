import type { Meta, StoryObj } from "@storybook/react-vite";
import { renderMarkdown } from "@app/components/viewer/nonpdf/MarkdownRenderer";

/**
 * How a `.md` file is rendered in the non-PDF viewer. `renderMarkdown` returns
 * nodes rather than a component, so the stories render its output directly —
 * the same thing the viewer mounts.
 */
const meta: Meta = {
  title: "Viewer/NonPdf/MarkdownRenderer",
  parameters: { layout: "padded" },
};
export default meta;

const Doc = ({ md }: { md: string }) => <div>{renderMarkdown(md)}</div>;

/** Headings, emphasis, a list and a link — ordinary prose. */
export const Prose: StoryObj = {
  render: () => (
    <Doc
      md={[
        "# Release notes",
        "",
        "The **August** build focuses on _throughput_.",
        "",
        "## Highlights",
        "",
        "- Batch processing is no longer serialised",
        "- Thumbnails render off the main thread",
        "- See the [changelog](https://example.com/changelog)",
      ].join("\n")}
    />
  ),
};

/** A fenced code block — the case with its own renderer override. */
export const CodeBlock: StoryObj = {
  render: () => (
    <Doc
      md={[
        "Run the container:",
        "",
        "```bash",
        "docker run -p 8080:8080 stirlingtools/stirling-pdf:latest",
        "```",
      ].join("\n")}
    />
  ),
};

/** A GFM table, which also has its own overrides for header and cell. */
export const Table: StoryObj = {
  render: () => (
    <Doc
      md={[
        "| Format | Input | Output |",
        "| --- | :-: | ---: |",
        "| PDF | yes | yes |",
        "| DOCX | yes | no |",
        "| PNG | yes | yes |",
      ].join("\n")}
    />
  ),
};

/** A wide table and a long code line — both must scroll inside the viewer
 *  rather than widening it. */
export const WideContent: StoryObj = {
  render: () => (
    <Doc
      md={[
        "```json",
        '{ "id": "doc_01HQ8ZK3", "source": "s3://bucket/very/long/object/key/contract-2026-final-signed.pdf", "status": "complete" }',
        "```",
        "",
        "| Field | Type | Description | Example | Notes |",
        "| --- | --- | --- | --- | --- |",
        "| id | string | Stable identifier | doc_01HQ8ZK3 | Opaque |",
        "| status | enum | queued / complete / failed | complete | Poll or subscribe |",
      ].join("\n")}
    />
  ),
};

/** Blockquote and nested list, the remaining common blocks. */
export const QuotesAndNesting: StoryObj = {
  render: () => (
    <Doc
      md={[
        "> Redaction rewrites the page content stream.",
        "",
        "1. Select the region",
        "   - Drag to extend",
        "   - Shift-click to add another",
        "2. Apply",
      ].join("\n")}
    />
  ),
};

/** An empty document. */
export const Empty: StoryObj = { render: () => <Doc md="" /> };
