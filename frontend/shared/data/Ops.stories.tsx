import type { Meta, StoryObj } from "@storybook/react";
import {
  PIPELINE_OPS,
  LIBRARY_OPS,
  OP_CATEGORIES,
  PIPELINE_AGENTS,
  SOURCE_OPTIONS,
  DESTINATION_OPTIONS,
  type OpKind,
} from "@shared/data/ops";

const meta: Meta = {
  title: "Data/Ops library",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

const STAGE_ORDER: OpKind[] = [
  "ingest",
  "validate",
  "modify",
  "secure",
  "store",
  "alert",
];
const STAGE_COLOUR: Record<OpKind, string> = {
  ingest: "var(--color-green)",
  validate: "var(--color-blue)",
  modify: "#F97316",
  secure: "var(--color-red)",
  store: "var(--color-purple)",
  alert: "var(--color-amber)",
};

export const PipelineOps: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {STAGE_ORDER.map((stage) => (
        <div key={stage}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: STAGE_COLOUR[stage],
              }}
            />
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--color-text-3)",
              }}
            >
              {stage}
            </h3>
            <span style={{ fontSize: 12, color: "var(--color-text-5)" }}>
              {PIPELINE_OPS[stage].length} ops
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PIPELINE_OPS[stage].map((op) => (
              <span
                key={op.id}
                title={op.desc}
                style={{
                  fontSize: 12,
                  padding: "0.25rem 0.625rem",
                  borderRadius: 999,
                  border: `1px solid ${STAGE_COLOUR[stage]}33`,
                  background: `${STAGE_COLOUR[stage]}12`,
                  color: STAGE_COLOUR[stage],
                  fontFamily: "var(--font-mono)",
                }}
              >
                {op.label}
                {op.defaultOn && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontFamily: "var(--font-sans)",
                      fontSize: 10,
                      opacity: 0.7,
                    }}
                  >
                    · default
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const LibraryByCategory: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-4)" }}>
        {LIBRARY_OPS.length} library ops across {OP_CATEGORIES.length}{" "}
        categories
      </div>
      {OP_CATEGORIES.map((cat) => {
        const ops = LIBRARY_OPS.filter((op) => op.category === cat.name);
        return (
          <div key={cat.name}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: cat.color,
                }}
              />
              <h3
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--color-text-1)",
                }}
              >
                {cat.name}
              </h3>
              <span style={{ fontSize: 12, color: "var(--color-text-5)" }}>
                {cat.blurb}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-text-5)",
                  marginLeft: "auto",
                }}
              >
                {ops.length}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ops.map((op) => (
                <span
                  key={op.id}
                  title={op.desc}
                  style={{
                    fontSize: 12,
                    padding: "0.25rem 0.625rem",
                    borderRadius: 999,
                    border: `1px solid ${cat.color}33`,
                    background: `${cat.color}12`,
                    color: cat.color,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {op.label}
                  {op.provider && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontFamily: "var(--font-sans)",
                        fontSize: 10,
                        opacity: 0.8,
                      }}
                    >
                      · {op.provider}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  ),
};

export const Agents: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 12,
      }}
    >
      {PIPELINE_AGENTS.map((a) => (
        <div
          key={a.id}
          style={{
            padding: 14,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <strong style={{ fontSize: 13, color: "var(--color-text-1)" }}>
              {a.label}
            </strong>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-4)",
              marginBottom: 8,
            }}
          >
            {a.desc}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {a.ops.map((op) => (
              <span
                key={op}
                style={{
                  fontSize: 11,
                  padding: "0.125rem 0.375rem",
                  borderRadius: 4,
                  background: "var(--color-bg-muted)",
                  color: "var(--color-text-3)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {op}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const SourcesAndDestinations: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div>
        <h3 style={{ margin: "0 0 0.625rem", fontSize: 13 }}>Sources</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SOURCE_OPTIONS.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "0.625rem 0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-surface)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-4)" }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 style={{ margin: "0 0 0.625rem", fontSize: 13 }}>Destinations</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {DESTINATION_OPTIONS.map((d) => (
            <div
              key={d.id}
              style={{
                padding: "0.625rem 0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-surface)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-4)" }}>
                {d.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};
