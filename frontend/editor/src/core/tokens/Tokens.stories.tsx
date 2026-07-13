import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "Foundations/Design Tokens",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

interface Swatch {
  label: string;
  varName: string;
}

function Group({ heading, swatches }: { heading: string; swatches: Swatch[] }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--color-section-label)",
          margin: "0 0 0.625rem",
        }}
      >
        {heading}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(11.25rem, 1fr))",
          gap: 10,
        }}
      >
        {swatches.map((s) => (
          <div
            key={s.varName}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 10,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: `var(${s.varName})`,
                border: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--color-text-2)",
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-4)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.varName}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Colours: Story = {
  render: () => (
    <div>
      <Group
        heading="Brand & status"
        swatches={[
          { label: "Blue", varName: "--color-blue" },
          { label: "Blue dark", varName: "--color-blue-dark" },
          { label: "Purple", varName: "--color-purple" },
          { label: "Green", varName: "--color-green" },
          { label: "Amber", varName: "--color-amber" },
          { label: "Red", varName: "--color-red" },
        ]}
      />
      <Group
        heading="Category accents (theme-stable)"
        swatches={[
          { label: "Insurance", varName: "--color-cat-insurance" },
          { label: "Compliance", varName: "--color-cat-compliance" },
          { label: "Finance", varName: "--color-cat-finance" },
          { label: "Legal", varName: "--color-cat-legal" },
          { label: "Healthcare", varName: "--color-cat-healthcare" },
          { label: "Government", varName: "--color-cat-government" },
          { label: "Operations", varName: "--color-cat-operations" },
          { label: "HR", varName: "--color-cat-hr" },
          { label: "Real estate", varName: "--color-cat-realestate" },
          { label: "Energy", varName: "--color-cat-energy" },
        ]}
      />
      <Group
        heading="Surfaces"
        swatches={[
          { label: "bg", varName: "--color-bg" },
          { label: "surface", varName: "--color-surface" },
          { label: "surface alt", varName: "--color-surface-alt" },
          { label: "bg subtle", varName: "--color-bg-subtle" },
          { label: "bg hover", varName: "--color-bg-hover" },
          { label: "bg muted", varName: "--color-bg-muted" },
          { label: "bg code", varName: "--color-bg-code" },
          { label: "border", varName: "--color-border" },
        ]}
      />
      <Group
        heading="Code palette (always dark)"
        swatches={[
          { label: "bg", varName: "--code-bg" },
          { label: "text", varName: "--code-text" },
          { label: "keyword", varName: "--code-keyword" },
          { label: "string", varName: "--code-string" },
          { label: "number", varName: "--code-number" },
          { label: "fn", varName: "--code-fn" },
          { label: "type", varName: "--code-type" },
          { label: "property", varName: "--code-property" },
        ]}
      />
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        color: "var(--color-text-1)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-5)",
            marginBottom: 4,
          }}
        >
          Brand wordmark (Alumni Sans)
        </div>
        <span
          style={{
            fontFamily: "var(--font-brand)",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          Stirling
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-5)",
            marginBottom: 4,
          }}
        >
          Page title (24/700)
        </div>
        <span style={{ fontSize: 24, fontWeight: 700 }}>Pipelines</span>
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-5)",
            marginBottom: 4,
          }}
        >
          Section title (13/600)
        </div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          Configured primitives
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-5)",
            marginBottom: 4,
          }}
        >
          Body (13/400)
        </div>
        <span style={{ fontSize: 13 }}>
          Drop a sample to see what just this op produces.
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-5)",
            marginBottom: 4,
          }}
        >
          Code (12 mono)
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          POST /v1/coi
        </span>
      </div>
    </div>
  ),
};

export const Motion: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          padding: 16,
          borderRadius: 8,
          animation: "fadeInUp 0.25s cubic-bezier(0.4, 0, 0.2, 1) both",
        }}
      >
        fadeInUp — standard view transition
      </div>
      <div
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          borderRadius: 6,
          background: "var(--color-green)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      />
    </div>
  ),
};
