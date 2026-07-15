// Presentational table for the audit results — one row per component + colour
// pair, worst contrast first. The Text cell renders in the finding's real
// colours so you can see the (un)readability directly.

import { type Finding } from "@app/ui/contrastAudit/scan";
import { cell, swatch } from "@app/ui/contrastAudit/styles";

export function FindingsTable({ rows }: { rows: Finding[] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={cell}>Ratio</th>
          <th style={cell}>Colors</th>
          <th style={cell}>Text</th>
          <th style={cell}>Component</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f, i) => (
          <tr key={`${f.storyTitle}-${f.fg}-${f.bg}-${i}`}>
            <td
              style={{
                ...cell,
                fontWeight: 700,
                color:
                  f.ratio < 3
                    ? "var(--color-red, #dc2626)"
                    : "var(--color-amber, #d97706)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {f.ratio.toFixed(2)}
              {f.count > 1 && (
                <span style={{ opacity: 0.6, fontWeight: 400 }}> ×{f.count}</span>
              )}
            </td>
            <td style={{ ...cell, whiteSpace: "nowrap" }}>
              <span style={swatch(f.fg)} />
              <code style={{ fontSize: 11 }}>{f.fg}</code> on{" "}
              <span style={swatch(f.bg)} />
              <code style={{ fontSize: 11 }}>{f.bg}</code>
            </td>
            <td style={cell}>
              <span
                style={{
                  color: f.fg,
                  background: f.bg,
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                {f.text || `<${f.tag}>`}
              </span>
            </td>
            <td style={{ ...cell, fontSize: 12 }}>
              <a
                href={`?path=/story/${f.storyId}`}
                target="_top"
                style={{ color: "var(--color-blue, #2563eb)" }}
              >
                {f.storyTitle}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
