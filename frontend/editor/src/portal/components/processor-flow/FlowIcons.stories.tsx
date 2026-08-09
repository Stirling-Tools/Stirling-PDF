import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  OutcomeIcon,
  SourceIcon,
} from "@portal/components/processor-flow/FlowIcons";

/** The glyphs the flow nodes are keyed off. `SourceIcon` falls back to a
 *  database glyph for any source type it doesn't recognise, so a new connector
 *  never renders a blank node. */
const meta: Meta = {
  title: "Portal/ProcessorFlow/FlowIcons",
  parameters: { layout: "centered" },
};
export default meta;

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
    {children}
  </div>
);

const Cell = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div style={{ display: "grid", justifyItems: "center", gap: "0.4rem" }}>
    {children}
    <span style={{ fontSize: "0.75rem", color: "var(--c-text-muted)" }}>
      {label}
    </span>
  </div>
);

/** Every source type that maps to a dedicated glyph, plus the fallback. */
export const Sources: StoryObj = {
  render: () => (
    <Row>
      <Cell label="editor">
        <SourceIcon type="editor" />
      </Cell>
      <Cell label="s3">
        <SourceIcon type="s3" />
      </Cell>
      <Cell label="folder">
        <SourceIcon type="folder" />
      </Cell>
      <Cell label="unknown → fallback">
        <SourceIcon type="something-new" />
      </Cell>
    </Row>
  ),
};

/** The two terminal audit outcomes. */
export const Outcomes: StoryObj = {
  render: () => (
    <Row>
      <Cell label="success">
        <OutcomeIcon outcome="success" />
      </Cell>
      <Cell label="failed">
        <OutcomeIcon outcome="failed" />
      </Cell>
    </Row>
  ),
};
