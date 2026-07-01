import type { Meta, StoryObj } from "@storybook/react-vite";

// Visual catalogue of the shared brand assets (shared/assets/brand) — the single
// source of truth for the Stirling logos used across the apps.
import modernMarkDark from "@shared/assets/brand/modern-logo/StirlingPDFLogoNoTextDark.svg";
import modernMarkLight from "@shared/assets/brand/modern-logo/StirlingPDFLogoNoTextLight.svg";
import modernBlack from "@shared/assets/brand/modern-logo/StirlingPDFLogoBlackText.svg";
import modernWhite from "@shared/assets/brand/modern-logo/StirlingPDFLogoWhiteText.svg";
import modernGrey from "@shared/assets/brand/modern-logo/StirlingPDFLogoGreyText.svg";
import classicMarkDark from "@shared/assets/brand/classic-logo/StirlingPDFLogoNoTextDark.svg";
import classicMarkLight from "@shared/assets/brand/classic-logo/StirlingPDFLogoNoTextLight.svg";
import classicBlack from "@shared/assets/brand/classic-logo/StirlingPDFLogoBlackText.svg";
import classicWhite from "@shared/assets/brand/classic-logo/StirlingPDFLogoWhiteText.svg";
import classicGrey from "@shared/assets/brand/classic-logo/StirlingPDFLogoGreyText.svg";

type Asset = { label: string; src: string; onDark?: boolean };
type VariantSet = { variant: string; mark: Asset[]; wordmark: Asset[] };

const SETS: VariantSet[] = [
  {
    variant: "modern",
    mark: [
      { label: "NoTextDark", src: modernMarkDark },
      { label: "NoTextLight", src: modernMarkLight, onDark: true },
    ],
    wordmark: [
      { label: "BlackText", src: modernBlack },
      { label: "GreyText", src: modernGrey },
      { label: "WhiteText", src: modernWhite, onDark: true },
    ],
  },
  {
    variant: "classic",
    mark: [
      { label: "NoTextDark", src: classicMarkDark },
      { label: "NoTextLight", src: classicMarkLight, onDark: true },
    ],
    wordmark: [
      { label: "BlackText", src: classicBlack },
      { label: "GreyText", src: classicGrey },
      { label: "WhiteText", src: classicWhite, onDark: true },
    ],
  },
];

function Swatch({ label, src, onDark, h }: Asset & { h: number }) {
  return (
    <figure
      style={{ margin: 0, display: "grid", gap: 6, justifyItems: "center" }}
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          padding: 16,
          minWidth: 140,
          borderRadius: 8,
          border: "1px solid rgba(128,128,128,0.25)",
          background: onDark ? "#1a1a1a" : "#ffffff",
        }}
      >
        <img src={src} alt={label} style={{ height: h, maxWidth: 200 }} />
      </div>
      <figcaption style={{ fontSize: 12, color: "var(--text-muted, #71717a)" }}>
        {label}
      </figcaption>
    </figure>
  );
}

function Row({ title, items }: { title: string; items: Asset[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h4 style={{ margin: 0, textTransform: "capitalize" }}>{title}</h4>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {items.map((a) => (
          <Swatch key={a.label} {...a} h={title === "mark" ? 48 : 28} />
        ))}
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Brand/Logos",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

/** Every brand mark + wordmark, per variant, on the background each is built for. */
export const Logos: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 32 }}>
      {SETS.map((set) => (
        <section key={set.variant} style={{ display: "grid", gap: 16 }}>
          <h3 style={{ margin: 0, textTransform: "capitalize" }}>
            {set.variant}
          </h3>
          <Row title="mark" items={set.mark} />
          <Row title="wordmark" items={set.wordmark} />
        </section>
      ))}
    </div>
  ),
};
