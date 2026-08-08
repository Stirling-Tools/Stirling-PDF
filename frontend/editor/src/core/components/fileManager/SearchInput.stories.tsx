/**
 * The file manager's search box. It reads the term and the change handler from
 * FileManagerContext rather than taking props, so the stories mount it against
 * a two-field slice of that context instead of the whole provider chain.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SearchInput from "@app/components/fileManager/SearchInput";
import {
  FileManagerContext,
  type FileManagerContextValue,
} from "@app/contexts/FileManagerContext";

/**
 * SearchInput reads exactly two fields. Supplying only those keeps the fixture
 * honest about what the component depends on; the cast is what makes a partial
 * value acceptable in place of the full context.
 */
function withSearch(
  searchTerm: string,
  onSearchChange: (term: string) => void = () => {},
) {
  return (children: React.ReactNode) => (
    <FileManagerContext.Provider
      value={
        { searchTerm, onSearchChange } as unknown as FileManagerContextValue
      }
    >
      {children}
    </FileManagerContext.Provider>
  );
}

const meta: Meta<typeof SearchInput> = {
  title: "FileManager/SearchInput",
  component: SearchInput,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof SearchInput>;

export const Empty: Story = {
  render: () => withSearch("")(<SearchInput />),
};

export const WithTerm: Story = {
  render: () => withSearch("invoice")(<SearchInput />),
};

/** Long terms are not truncated by the component — the field scrolls instead. */
export const LongTerm: Story = {
  render: () =>
    withSearch("quarterly-report-2026-final-revised-approved")(<SearchInput />),
};

/** The container controls width, so the box stretches to whatever it is given. */
export const Narrow: Story = {
  render: () => (
    <div style={{ width: 220 }}>{withSearch("draft")(<SearchInput />)}</div>
  ),
};

/** Typing is driven by the context handler, so state lives outside the field. */
export const Interactive: Story = {
  render: function Interactive() {
    const [term, setTerm] = useState("");
    return withSearch(term, setTerm)(<SearchInput />);
  },
};
