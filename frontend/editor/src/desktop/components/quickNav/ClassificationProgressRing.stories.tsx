import { useEffect, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import LocalIcon from "@app/components/shared/LocalIcon";
import { NavSurface } from "@app/ui/NavSurface";
import {
  QuickNavRailBase,
  type QuickNavEntry,
} from "@app/components/shared/quickNav/QuickNavRailBase";
import {
  ClassificationProgressRing,
  type ClassificationProgressRingVariant,
} from "@app/components/quickNav/ClassificationProgressRing";
import "@app/components/shared/quickNav/QuickNavRailContainer.css";

/**
 * Draft of the rail indicator for a folder being classified in the background. The ring
 * fills in proportion to the whole folder, the count sits inside, and hovering names it.
 * `Live` runs one whole job: filling, tick, collapse, gone.
 */
const meta = {
  title: "Onboarding/Classification Progress Ring",
  component: ClassificationProgressRing,
  parameters: { layout: "centered" },
  args: {
    processed: 55,
    total: 558,
    status: "running",
    variant: "fraction",
    folderName: "Downloads",
  },
  argTypes: {
    variant: { control: "radio", options: ["fraction", "count"] },
    status: { control: "radio", options: ["running", "done"] },
  },
} satisfies Meta<typeof ClassificationProgressRing>;
export default meta;

type Story = StoryObj<typeof meta>;

const SIZE = "1.125rem";

/** The rail column the ring sits in, so it is judged at the size it will really be. */
function Rail({ children }: { children: ReactNode }) {
  const entry = (
    id: string,
    label: string,
    icon: ReactNode,
  ): QuickNavEntry => ({
    id,
    label,
    icon,
    onClick: () => {},
  });
  return (
    <div className="quick-nav-rail-container" style={{ height: 300 }}>
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          groups={[
            [
              entry(
                "reader",
                "Reader",
                <LocalIcon
                  icon="menu-book-outline-rounded"
                  width={SIZE}
                  height={SIZE}
                />,
              ),
              entry(
                "editor",
                "Editor",
                <LocalIcon
                  icon="edit-outline-rounded"
                  width={SIZE}
                  height={SIZE}
                />,
              ),
            ],
            [
              entry(
                "files",
                "File library",
                <LocalIcon
                  icon="folder-outline-rounded"
                  width={SIZE}
                  height={SIZE}
                />,
              ),
              entry(
                "automate",
                "Automate",
                <LocalIcon
                  icon="rebase-outline-rounded"
                  width={SIZE}
                  height={SIZE}
                />,
              ),
            ],
          ]}
          footer={<div className="quick-nav-rail-footer">{children}</div>}
        />
      </NavSurface>
    </div>
  );
}

const inRail: Story["render"] = (args) => (
  <Rail>
    <ClassificationProgressRing {...args} />
  </Rail>
);

/** 55 of 558 done: a tenth of the ring filled, x over y inside. Hover for the tooltip. */
export const TenPercent: Story = { render: inRail };

export const Half: Story = {
  args: { processed: 279 },
  render: inRail,
};

export const NearlyDone: Story = {
  args: { processed: 540 },
  render: inRail,
};

/** Just x inside; the total lives in the tooltip. Larger digits, less to read. */
export const CountOnly: Story = {
  args: { variant: "count", processed: 279 },
  render: inRail,
};

/** The moment it finishes: full ring, tick, then it collapses out of the rail. */
export const Done: Story = {
  args: { processed: 558, status: "done" },
  render: inRail,
};

function LiveRing({
  variant,
  total,
  msPerFile,
}: {
  variant: ClassificationProgressRingVariant;
  total: number;
  msPerFile: number;
}) {
  const [processed, setProcessed] = useState(0);
  const [done, setDone] = useState(false);
  const [visible, setVisible] = useState(true);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    let stopped = false;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(() => !stopped && fn(), ms));
    };
    setProcessed(0);
    setDone(false);
    setVisible(true);
    // The first fifty are the onboarding batch, already done when the ring appears.
    for (let i = 51; i <= total; i += 1) {
      at((i - 50) * msPerFile, () => setProcessed(i));
    }
    at((total - 50) * msPerFile + 300, () => setDone(true));
    return () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [cycle, total, msPerFile]);

  // Removed from the rail once the tick has been seen, as the real one will be, then a
  // pause before it starts over so the empty rail is visible too.
  const settle = () => {
    setVisible(false);
    window.setTimeout(() => setCycle((n) => n + 1), 1500);
  };

  return (
    <Rail>
      {visible && (
        <ClassificationProgressRing
          processed={Math.max(processed, 50)}
          total={total}
          status={done ? "done" : "running"}
          variant={variant}
          folderName="Downloads"
          onSettled={settle}
        />
      )}
    </Rail>
  );
}

/** One whole background job on a loop: fills from the first batch to the end, ticks,
 *  collapses, gone, and again. */
export const Live: Story = {
  args: { total: 558 },
  render: (args) => (
    <LiveRing
      variant={args.variant ?? "fraction"}
      total={args.total}
      msPerFile={25}
    />
  ),
};
