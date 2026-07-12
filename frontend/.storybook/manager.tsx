// Custom toolbar control: an accent-colour swatch picker next to the theme
// toggle. Picking a colour sets the accent for the CURRENT mode (light/dark) —
// it writes the `accentLight` / `accentDark` global, which preview.tsx feeds
// through deriveAccessiblePrimary to tint the canvas exactly like the editor.
import React from "react";
import { addons, types, useGlobals } from "storybook/manager-api";
import { IconButton, WithTooltip } from "storybook/internal/components";
// Single source of truth for the 3×5 accent grid. Imported by relative path
// (not @core) because the Storybook manager bundle doesn't resolve app aliases;
// constants/theme.ts has no imports of its own, so this stays cheap to bundle.
import { THEME_ACCENT_PRESETS as PRESETS } from "../editor/src/core/constants/theme";

function AccentPicker() {
  const [globals, updateGlobals] = useGlobals();
  const scheme = globals.theme === "dark" ? "dark" : "light";
  const key = scheme === "dark" ? "accentDark" : "accentLight";
  const current = (globals[key] as string) || "#3b82f6";

  return (
    <WithTooltip
      placement="bottom"
      trigger="click"
      closeOnOutsideClick
      tooltip={({ onHide }: { onHide: () => void }) => (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 22px)",
            gap: 6,
            padding: 10,
          }}
        >
          {PRESETS.map((color) => {
            const selected = color.toLowerCase() === current.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={color}
                onClick={() => {
                  updateGlobals({ [key]: color });
                  onHide();
                }}
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  borderRadius: 5,
                  background: color,
                  cursor: "pointer",
                  border: selected ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.25)",
                }}
              />
            );
          })}
        </div>
      )}
    >
      <IconButton key="accent" title={`Accent colour (${scheme} mode)`}>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: current,
            boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.35)",
          }}
        />
      </IconButton>
    </WithTooltip>
  );
}

addons.register("stirling/accent", () => {
  addons.add("stirling/accent-toolbar", {
    type: types.TOOL,
    title: "Accent colour",
    match: ({ viewMode }) => viewMode === "story" || viewMode === "docs",
    render: () => <AccentPicker />,
  });
});
