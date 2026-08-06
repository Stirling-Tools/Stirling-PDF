import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocsSearch } from "@portal/components/docs/DocsSearch";
import { resultsFor } from "@portal/components/docs/storyFixtures";
import "@portal/views/DeveloperDocs.css";

/** Docs search box and its ranked results. Results come from the real indexer,
 *  so the highlighting and snippet windows shown here are the ones users get.
 *  Arrow keys move the selection; Enter opens it. */
const meta: Meta<typeof DocsSearch> = {
  title: "Portal/Docs/DocsSearch",
  component: DocsSearch,
  parameters: { layout: "padded" },
  args: { onQueryChange: () => {}, onSelect: () => {} },
};
export default meta;

type Story = StoryObj<typeof DocsSearch>;

/** Idle: no query, so no result list. */
export const Empty: Story = {
  args: { query: "", results: [] },
};

/** A term that hits several docs, matching in both titles and body text. */
export const WithResults: Story = {
  args: { query: "document", results: resultsFor("document") },
};

/** A term that only matches body text — the title renders unhighlighted. */
export const BodyMatchOnly: Story = {
  args: { query: "backoff", results: resultsFor("backoff") },
};

/** Multi-term query; a doc must contain every term to rank. */
export const MultiTerm: Story = {
  args: { query: "token header", results: resultsFor("token header") },
};

/** A query with no matches — the "no results" state. */
export const NoMatches: Story = {
  args: { query: "kubernetes", results: [] },
};

/** Live box: type to drive the real indexer, including the empty and
 *  no-match states, and to exercise arrow-key selection. */
export const Interactive: Story = {
  render: () => {
    const [query, setQuery] = useState("upload");
    return (
      <DocsSearch
        query={query}
        onQueryChange={setQuery}
        results={resultsFor(query)}
        onSelect={() => {}}
      />
    );
  },
};
