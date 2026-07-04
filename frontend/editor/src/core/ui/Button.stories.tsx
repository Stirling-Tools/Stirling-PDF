import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@app/ui/Button";

/* tiny inline icons for the demos */
const Plus = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const Arrow = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M5 12h14m0 0-5-5m5 5-5 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const Trash = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M5 7h14M10 7V5h4v2m-8 0 1 13h6l1-13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const Sparkle = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
    <path d="M19 14l.9 2.4L22 17l-2.1.8L19 20l-.9-2.2L16 17l2.1-.6L19 14z" />
  </svg>
);

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { text: "Button", variant: "primary", accent: "default", size: "md" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "secondary", "tertiary", "quiet"],
    },
    accent: {
      control: "inline-radio",
      options: [
        "default",
        "neutral",
        "brand",
        "ai",
        "premium",
        "danger",
        "success",
        "warning",
      ],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg", "xl"] },
    justify: {
      control: "inline-radio",
      options: ["center", "start", "end", "between"],
    },
    shape: { control: "inline-radio", options: ["default", "circle", "pill"] },
    text: { control: "text" },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

const Wrap = ({ children }: { children: ReactNode }) => (
  <div
    style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}
  >
    {children}
  </div>
);

/** Tweak every prop live with the controls. */
export const Playground: Story = {};

/** The three fill treatments. */
export const Variants: Story = {
  render: (args) => (
    <Wrap>
      <Button {...args} variant="primary" text="Primary" />
      <Button {...args} variant="secondary" text="Secondary" />
      <Button {...args} variant="tertiary" text="Tertiary" />
    </Wrap>
  ),
};

/** Every accent × the three variants. Unset = `default` (blue). */
export const Accents: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, auto)",
        gap: 10,
        justifyContent: "start",
      }}
    >
      {(["primary", "secondary", "tertiary"] as const).flatMap((variant) =>
        (
          [
            "default",
            "neutral",
            "brand",
            "ai",
            "premium",
            "danger",
            "success",
            "warning",
          ] as const
        ).map((accent) => (
          <Button
            key={`${variant}-${accent}`}
            variant={variant}
            accent={accent}
            text={accent}
          />
        )),
      )}
    </div>
  ),
};

/** Real size differences. */
export const Sizes: Story = {
  render: (args) => (
    <Wrap>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <Button key={size} {...args} size={size} text={size} />
      ))}
    </Wrap>
  ),
};

/** Icons are optional and positional: `leftSection`, `rightSection`, or both. */
export const WithIcons: Story = {
  render: (args) => (
    <Wrap>
      <Button {...args} leftSection={<Plus />} text="Left icon" />
      <Button {...args} rightSection={<Arrow />} text="Right icon" />
      <Button
        {...args}
        leftSection={<Plus />}
        rightSection={<Arrow />}
        text="Both"
      />
    </Wrap>
  ),
};

/** Pass an icon and NO text — that's all an "icon-only" button is. No separate component. */
export const IconOnly: Story = {
  render: () => (
    <Wrap>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <Button
          key={size}
          size={size}
          leftSection={<Plus />}
          aria-label="Add"
        />
      ))}
      <Button variant="secondary" leftSection={<Plus />} aria-label="Add" />
      <Button
        variant="tertiary"
        accent="danger"
        leftSection={<Trash />}
        aria-label="Delete"
      />
    </Wrap>
  ),
};

/** How content sits across the width (only visible when wider than the content,
 * e.g. `fullWidth`). `between` pins icons to the edges and keeps the label dead-
 * centre — the toolbar/nav row pattern. */
export const Justify: Story = {
  render: () => (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}
    >
      {(["center", "start", "end", "between"] as const).map((justify) => (
        <Button
          key={justify}
          fullWidth
          justify={justify}
          variant="secondary"
          leftSection={<Plus />}
          rightSection={<Arrow />}
          text={justify}
        />
      ))}
    </div>
  ),
};

/** `circle` makes a round control (pair it with an icon-only button); `pill` fully rounds a text button. */
export const Shape: Story = {
  render: () => (
    <Wrap>
      <Button
        shape="circle"
        variant="secondary"
        leftSection={<Plus />}
        aria-label="Add"
      />
      <Button
        shape="circle"
        variant="tertiary"
        leftSection={<Arrow />}
        aria-label="Next"
      />
      <Button
        shape="circle"
        variant="primary"
        leftSection={<Trash />}
        aria-label="Delete"
      />
      <Button shape="pill" variant="primary" text="Pill" />
      <Button shape="default" variant="secondary" text="Default" />
    </Wrap>
  ),
};

/** `accent="premium"` — a gradient CTA for upgrade moments. The gradient lives
 * on the `filled` variant (subtle brighten on hover, nothing flashy);
 * outlined/ghost fall back to a calm violet. */
export const Premium: Story = {
  render: () => (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}
    >
      <Button
        accent="premium"
        size="lg"
        fullWidth
        leftSection={<Sparkle />}
        text="Upgrade to Processor Plan"
      />
      <Wrap>
        <Button accent="premium" text="Upgrade" />
        <Button accent="premium" leftSection={<Sparkle />} text="Go Pro" />
        <Button
          accent="premium"
          shape="pill"
          rightSection={<Arrow />}
          text="Get Pro"
        />
        <Button
          accent="premium"
          leftSection={<Sparkle />}
          aria-label="Upgrade"
        />
      </Wrap>
      <Wrap>
        <Button accent="premium" variant="secondary" text="Outlined" />
        <Button accent="premium" variant="tertiary" text="Ghost" />
        <Button accent="premium" disabled text="Disabled" />
      </Wrap>
      <Wrap>
        {(["sm", "md", "lg", "xl"] as const).map((size) => (
          <Button
            key={size}
            accent="premium"
            size={size}
            leftSection={<Sparkle />}
            text={size}
          />
        ))}
      </Wrap>
    </div>
  ),
};
