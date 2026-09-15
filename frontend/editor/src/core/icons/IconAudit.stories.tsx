import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon, isIconName } from "@app/ui/Icon";
import { ICONS } from "@app/icons/icons";
import { STROKE_WIDTH } from "@app/icons/icons.config";
import iconMap from "@app/icons/icon-map.json";
import legacyGlyphs from "virtual:legacy-icons";

import "@app/icons/IconAudit.css";

/** Every legacy icon beside its replacement. Delete with its css and icon-map.json once signed off. */
const meta = {
  title: "Migration/Icon audit",
  parameters: { layout: "fullscreen", a11y: { disable: true } },
} satisfies Meta;
export default meta;

type LegacyEntry = { viewBox: string; body: string };
const legacy = legacyGlyphs as {
  mui: Record<string, LegacyEntry>;
  materialSymbols: Record<string, LegacyEntry>;
};

function LegacyGlyph({ entry }: { entry: LegacyEntry }) {
  return (
    <svg
      className="icon-audit__legacy"
      width={24}
      height={24}
      viewBox={entry.viewBox}
      // icon-lint-disable -- upstream glyph read from node_modules for the diff
      dangerouslySetInnerHTML={{ __html: entry.body }}
    />
  );
}

/** A mapping target the app never uses is absent from the bundle by design. */
function Replacement({ target }: { target: string }) {
  return isIconName(target) ? (
    <Icon name={target} size={24} />
  ) : (
    <span className="icon-audit__absent" title="not bundled: nothing uses it">
      –
    </span>
  );
}

function Section({
  title,
  note,
  store,
  section,
}: {
  title: string;
  note?: string;
  store: Record<string, LegacyEntry>;
  section: Record<string, string>;
}) {
  const rows = Object.entries(section).filter(([name]) => store[name]);
  return (
    <section>
      <h2 className="icon-audit__h2">
        {title} <span className="icon-audit__count">{rows.length}</span>
      </h2>
      {note && <p className="icon-audit__note">{note}</p>}
      <table className="icon-audit__table">
        <tbody>
          {rows.map(([name, target]) => (
            <tr key={name}>
              <td className="icon-audit__cell">
                <LegacyGlyph entry={store[name]} />
              </td>
              <td className="icon-audit__arrow">→</td>
              <td className="icon-audit__cell">
                <Replacement target={target} />
              </td>
              <td className="icon-audit__name">{name}</td>
              <td className="icon-audit__name icon-audit__name--target">
                {target}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const BeforeAfter: StoryObj = {
  render: () => {
    const total =
      Object.keys(iconMap.mui).length +
      Object.keys(iconMap.materialSymbols).length +
      Object.keys(iconMap.portal).length +
      Object.keys(iconMap.labelIcons).length;
    return (
      <div className="icon-audit">
        <h1 className="icon-audit__h1">Icon consolidation: before / after</h1>
        <p className="icon-audit__note">
          Left glyph is what the app used before. Right glyph is its
          replacement, drawn from Lucide at stroke {STROKE_WIDTH}. {total}{" "}
          legacy names map onto {Object.keys(ICONS).length} icons.
        </p>
        <Section
          title="@mui/icons-material → Lucide"
          store={legacy.mui}
          section={iconMap.mui}
        />
        <Section
          title="Material Symbols → Lucide"
          store={legacy.materialSymbols}
          section={iconMap.materialSymbols}
        />
        <Section
          title="Classification label palette → Lucide"
          note="Icons users pick for classification labels, mirrored in the backend resource."
          store={legacy.materialSymbols}
          section={iconMap.labelIcons}
        />
      </div>
    );
  },
};
