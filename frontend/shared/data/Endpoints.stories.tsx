import type { Meta, StoryObj } from "@storybook/react";
import { VERTICALS, ALL_ENDPOINTS } from "@shared/data/endpoints";
import { MethodBadge } from "@shared/components/MethodBadge";
import { StatusBadge } from "@shared/components/StatusBadge";

const meta: Meta = {
  title: "Data/Endpoint catalogue",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Live preview of the typed endpoint catalogue in src/data/endpoints.ts. Verticals come from VERTICALS, the flat list from ALL_ENDPOINTS.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const ByVertical: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-4)" }}>
        {ALL_ENDPOINTS.length} endpoints across {VERTICALS.length} verticals
      </div>
      {VERTICALS.map((v) => (
        <div key={v.key}>
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
                background: v.color,
              }}
            />
            <h3
              style={{ margin: 0, fontSize: 14, color: "var(--color-text-1)" }}
            >
              {v.label}
            </h3>
            <span style={{ fontSize: 12, color: "var(--color-text-5)" }}>
              {v.endpoints.length} endpoints
            </span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {v.endpoints.map((e) => (
              <div
                key={e.endpoint}
                style={{
                  display: "grid",
                  gridTemplateColumns: "4.375rem 13.75rem 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "0.625rem 0.875rem",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <MethodBadge method="POST" />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--color-text-2)",
                  }}
                >
                  {e.endpoint}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--color-text-1)",
                    }}
                  >
                    {e.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-4)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.desc}
                  </div>
                </div>
                <StatusBadge
                  tone={
                    e.tier === 0 ? "success" : e.tier === 1 ? "info" : "purple"
                  }
                  size="sm"
                >
                  {e.tier === 0 ? "free" : e.tier === 1 ? "paid" : "enterprise"}
                </StatusBadge>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};
