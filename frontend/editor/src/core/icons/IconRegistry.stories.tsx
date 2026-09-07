import type { Meta, StoryObj } from "@storybook/react-vite";
import { createElement, useMemo, useState } from "react";

import { Icon } from "@app/ui/Icon";
import {
  ICONS,
  STROKE_WIDTH,
  type IconName,
} from "@app/icons/registry.generated";
import { STIRLING_ICONS } from "@app/icons/stirlingIcons.generated";
import { THIRD_PARTY_ICONS } from "@app/icons/thirdPartyIcons.generated";

import "@app/icons/IconRegistry.css";

/** Every icon the app can render, for checking the set reads as one family. */
const meta = {
  title: "Icons/Registry",
  parameters: { layout: "fullscreen", a11y: { disable: true } },
} satisfies Meta;
export default meta;

const ALL = Object.keys(ICONS).sort() as IconName[];
const CUSTOM = new Set(Object.keys(STIRLING_ICONS));
const BRAND = new Set(Object.keys(THIRD_PARTY_ICONS));

function Tile({ name }: { name: IconName }) {
  const kind = CUSTOM.has(name) ? "custom" : BRAND.has(name) ? "brand" : null;
  return (
    <div className="icon-registry__tile">
      <div className="icon-registry__sizes">
        {[16, 20, 24].map((size) =>
          createElement(Icon, { key: size, name, size }),
        )}
      </div>
      <code>{name}</code>
      {kind && (
        <span className={`icon-registry__tag icon-registry__tag--${kind}`}>
          {kind}
        </span>
      )}
    </div>
  );
}

export const AllIcons: StoryObj = {
  render: () => {
    const [query, setQuery] = useState("");
    const shown = useMemo(
      () => ALL.filter((n) => n.includes(query.trim().toLowerCase())),
      [query],
    );
    return (
      <div className="icon-registry">
        <h1 className="icon-registry__h1">{ALL.length} icons</h1>
        <p className="icon-registry__note">
          Lucide at stroke {STROKE_WIDTH}, plus {CUSTOM.size} of our own
          drawings and {BRAND.size} brand marks. Rendered at 16, 20 and 24px.
        </p>
        <input
          className="icon-registry__search"
          placeholder="Filter by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="icon-registry__grid">
          {shown.map((name) => (
            <Tile key={name} name={name} />
          ))}
        </div>
      </div>
    );
  },
};

/** Just the icons we draw ourselves, where quality problems show up first. */
export const CustomIcons: StoryObj = {
  render: () => (
    <div className="icon-registry">
      <h1 className="icon-registry__h1">Our own icons</h1>
      <p className="icon-registry__note">
        Drawn in lucide&apos;s grammar and living in
        src/core/icons/svg/stirling.
      </p>
      <div className="icon-registry__grid">
        {[...CUSTOM].sort().map((name) => (
          <Tile key={name} name={name as IconName} />
        ))}
      </div>
    </div>
  ),
};
