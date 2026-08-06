import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocsToc } from "@portal/components/docs/DocsToc";
import { MarkdownDoc } from "@portal/components/docs/MarkdownDoc";
import {
  SAMPLE_HEADINGS,
  SAMPLE_MARKDOWN,
  SHORT_HEADINGS,
  SHORT_MARKDOWN,
} from "@portal/components/docs/storyFixtures";
import "@portal/views/DeveloperDocs.css";

/**
 * "On this page". The scroll-spy observes the reading pane, so these stories
 * mount the real pane next to it — scroll the left column and the highlight
 * follows. A TOC rendered without its pane can't demonstrate that.
 */
const meta: Meta<typeof DocsToc> = {
  title: "Portal/Docs/DocsToc",
  component: DocsToc,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof DocsToc>;

function PaneWithToc({
  markdown,
  headings,
}: {
  markdown: string;
  headings: typeof SAMPLE_HEADINGS;
}) {
  const scrollRef = useRef<HTMLElement | null>(null);
  return (
    <div style={{ display: "flex", gap: "2rem", height: "70vh", padding: "1rem" }}>
      <article
        ref={scrollRef}
        style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: "1rem" }}
      >
        <MarkdownDoc markdown={markdown} onNavigate={() => {}} />
      </article>
      <div style={{ width: 220, flexShrink: 0 }}>
        <DocsToc headings={headings} scrollRef={scrollRef} />
      </div>
    </div>
  );
}

/** H2s and H3s from a full doc, beside the pane they track. */
export const Default: Story = {
  render: () => (
    <PaneWithToc markdown={SAMPLE_MARKDOWN} headings={SAMPLE_HEADINGS} />
  ),
};

/** A doc with a single heading — the list barely earns its place. */
export const FewHeadings: Story = {
  render: () => (
    <PaneWithToc markdown={SHORT_MARKDOWN} headings={SHORT_HEADINGS} />
  ),
};

/** No headings at all: nothing to spy on, nothing to list. */
export const NoHeadings: Story = {
  render: () => <PaneWithToc markdown="Just prose, no headings." headings={[]} />,
};

/** Long heading text, to check the entries wrap or truncate inside the rail
 *  instead of widening it. */
export const LongHeadings: Story = {
  render: () => {
    const markdown = [
      "## Configuring retry behaviour for webhook delivery failures",
      "Body.",
      "### Exponential backoff windows and the twenty-four hour ceiling",
      "Body.",
    ].join("\n\n");
    return (
      <PaneWithToc
        markdown={markdown}
        headings={[
          {
            level: 2,
            text: "Configuring retry behaviour for webhook delivery failures",
            slug: "configuring-retry-behaviour-for-webhook-delivery-failures",
          },
          {
            level: 3,
            text: "Exponential backoff windows and the twenty-four hour ceiling",
            slug: "exponential-backoff-windows-and-the-twenty-four-hour-ceiling",
          },
        ]}
      />
    );
  },
};
