import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownDoc } from "@portal/components/docs/MarkdownDoc";
import {
  SAMPLE_MARKDOWN,
  SHORT_MARKDOWN,
} from "@portal/components/docs/storyFixtures";
import "@portal/views/DeveloperDocs.css";

/** Renders a doc's normalised markdown. Cross-doc links carry the `doc:`
 *  scheme and are intercepted so they navigate inside the portal; every other
 *  URL is sanitised as react-markdown would by default. */
const meta: Meta<typeof MarkdownDoc> = {
  title: "Portal/Docs/MarkdownDoc",
  component: MarkdownDoc,
  parameters: { layout: "padded" },
  args: { onNavigate: () => {} },
};
export default meta;

type Story = StoryObj<typeof MarkdownDoc>;

/** Every block the renderer special-cases: headings with anchor ids, a fenced
 *  code sample with its copy button, a GFM table, a list, and a `doc:` link. */
export const Default: Story = {
  args: { markdown: SAMPLE_MARKDOWN },
};

/** A short doc — prose and one heading. */
export const Short: Story = {
  args: { markdown: SHORT_MARKDOWN },
};

/** Repeated heading text: the slugger de-dupes, so anchors stay unique and the
 *  TOC's links still resolve. */
export const DuplicateHeadings: Story = {
  args: {
    markdown: [
      "## Errors",
      "Upload errors.",
      "## Errors",
      "Download errors.",
      "### Errors",
      "Nested, same text again.",
    ].join("\n\n"),
  },
};

/** Link handling: an internal `doc:` link navigates in-app, an external one is
 *  left alone, and an unknown scheme is stripped. */
export const Links: Story = {
  args: {
    markdown: [
      "[Internal cross-doc link](doc:auth-tokens)",
      "[External link](https://example.com/docs)",
      "[Unsafe scheme](javascript:alert(1))",
    ].join("\n\n"),
  },
};

/** A wide code block and a wide table — both must scroll inside the reading
 *  pane rather than widening it. */
export const WideContent: Story = {
  args: {
    markdown: [
      "```json",
      '{ "id": "doc_01HQ...", "status": "queued", "pages": null, "source": "s3://bucket/very/long/object/key/contract-2026-final.pdf" }',
      "```",
      "",
      "| Field | Type | Description | Example | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| id | string | Stable identifier returned on upload | doc_01HQ8ZK3 | Opaque |",
      "| status | enum | queued, processing, complete, failed | queued | Poll or use webhooks |",
    ].join("\n"),
  },
};

/** Nothing to render. */
export const EmptyDocument: Story = {
  args: { markdown: "" },
};
