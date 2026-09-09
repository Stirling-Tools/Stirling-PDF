import type { Meta, StoryObj } from "@storybook/react-vite";
import { createElement, type ReactNode, useMemo, useState } from "react";

import { Icon } from "@app/ui/Icon";
import {
  ICONS,
  STROKE_WIDTH,
  type IconName,
} from "@app/icons/registry.generated";
import { STIRLING_ICONS } from "@app/icons/stirlingIcons.generated";
import { THIRD_PARTY_ICONS } from "@app/icons/thirdPartyIcons.generated";
import usedIcons from "virtual:used-icons";

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

// Brand marks resolve from the connector type the API returns, never from a
// literal, so the scan cannot see them and they are counted in regardless.
const USED = new Set([...usedIcons, ...BRAND]);
const IN_USE = ALL.filter((name) => USED.has(name));

const SIZES = [16, 20, 24] as const;

function Tile({ name, sizes }: { name: IconName; sizes: readonly number[] }) {
  const kind = CUSTOM.has(name) ? "custom" : BRAND.has(name) ? "brand" : null;
  return (
    <div className="icon-registry__tile">
      <div className="icon-registry__sizes">
        {sizes.map((size) => createElement(Icon, { key: size, name, size }))}
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

function Gallery({
  heading,
  note,
  names,
  sizes = SIZES,
}: {
  heading: string;
  note: ReactNode;
  names: readonly IconName[];
  sizes?: readonly number[];
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? names.filter((n) => n.includes(q)) : names;
  }, [names, query]);
  return (
    <div className="icon-registry">
      <h1 className="icon-registry__h1">{heading}</h1>
      <p className="icon-registry__note">{note}</p>
      <input
        className="icon-registry__search"
        placeholder="Filter by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="icon-registry__grid">
        {shown.map((name) => (
          <Tile key={name} name={name} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}

/** The working view: what the app renders today, small enough to scan by eye. */
export const InUse: StoryObj = {
  render: () => (
    <Gallery
      heading={`${IN_USE.length} icons in use`}
      note={
        <>
          Names the app references, out of {ALL.length} bundled. Rendered at 16,
          20 and 24px. Reach for one of these before adding a new name, so the
          same idea does not end up drawn two ways.
        </>
      }
      names={IN_USE}
    />
  ),
};

/** The catalogue: everything `IconName` accepts, for finding a name. */
export const AllIcons: StoryObj = {
  render: () => (
    <Gallery
      heading={`${ALL.length} icons available`}
      note={
        <>
          All of Lucide at stroke {STROKE_WIDTH}, plus {CUSTOM.size} of our own
          drawings and {BRAND.size} brand marks. Every name here type-checks in{" "}
          <code>&lt;Icon name=&quot;…&quot; /&gt;</code> with nothing to
          regenerate. Rendered at 24px; filter to see a name at all three sizes
          in <em>In use</em>.
        </>
      }
      names={ALL}
      sizes={[24]}
    />
  ),
};

/** Just the icons we draw ourselves, where quality problems show up first. */
export const CustomIcons: StoryObj = {
  render: () => (
    <Gallery
      heading="Our own icons"
      note="Drawn in Lucide's grammar and living in src/core/icons/svg/stirling."
      names={[...CUSTOM].sort() as IconName[]}
    />
  ),
};
