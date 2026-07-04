import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildDocsNav } from "@portal/mocks/docs";
import { DocsNav, DocsNavSkeleton } from "@portal/components/docs/DocsNav";
import "@portal/views/DeveloperDocs.css";

const meta: Meta<typeof DocsNav> = {
  title: "Portal/DeveloperDocs/DocsNav",
  component: DocsNav,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "15rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocsNav>;

const sections = buildDocsNav();

export const Default: Story = {
  render: () => {
    const [active, setActive] = useState("quickstart");
    return <DocsNav sections={sections} active={active} onSelect={setActive} />;
  },
};

/** Webhooks ("Beta") and Agent skills ("New") exercise both badge tones. */
export const BadgedLeafActive: Story = {
  render: () => {
    const [active, setActive] = useState("skill-catalog");
    return <DocsNav sections={sections} active={active} onSelect={setActive} />;
  },
};

export const Loading: StoryObj = {
  render: () => <DocsNavSkeleton />,
};
