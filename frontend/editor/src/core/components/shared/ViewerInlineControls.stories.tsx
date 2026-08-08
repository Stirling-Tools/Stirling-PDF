/**
 * The zoom controls that appear in the workbench bar while the viewer is the
 * active workbench. They render nothing anywhere else, so every story here has
 * to say the workbench is "viewer".
 *
 * Zoom is pushed at the component rather than pulled: it seeds from
 * getZoomState() and then subscribes for updates, so the fixture below hands
 * back a fixed level and a subscription that never fires. The Live story wires
 * the subscription up properly so the slider and buttons actually move.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewerInlineControls } from "@app/components/shared/ViewerInlineControls";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";
import {
  NavigationStateContext,
  type NavigationContextStateValue,
} from "@app/contexts/NavigationContext";

/** Only `workbench` is read; the rest of navigation state is irrelevant here. */
function navState(workbench: string) {
  return { workbench } as unknown as NavigationContextStateValue;
}

/** A viewer that reports one zoom level and never publishes another. */
function staticViewer(zoomPercent: number) {
  return {
    getZoomState: () => ({ zoomPercent }),
    registerImmediateZoomUpdate: () => () => {},
    zoomActions: {
      zoomIn: () => {},
      zoomOut: () => {},
      setZoomLevel: () => {},
    },
  } as unknown as ViewerContextType;
}

function Fixture({
  zoomPercent = 100,
  workbench = "viewer",
}: {
  zoomPercent?: number;
  workbench?: string;
}) {
  return (
    <NavigationStateContext.Provider value={navState(workbench)}>
      <ViewerContext.Provider value={staticViewer(zoomPercent)}>
        <ViewerInlineControls />
      </ViewerContext.Provider>
    </NavigationStateContext.Provider>
  );
}

const meta: Meta<typeof ViewerInlineControls> = {
  title: "Shared/ViewerInlineControls",
  component: ViewerInlineControls,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof ViewerInlineControls>;

export const Default: Story = { render: () => <Fixture /> };

/** The slider clamps to 20–500, so these two sit at its ends. */
export const MinimumZoom: Story = { render: () => <Fixture zoomPercent={20} /> };

export const MaximumZoom: Story = {
  render: () => <Fixture zoomPercent={500} />,
};

/** Levels outside the slider's range still clamp rather than overflow it. */
export const BeyondSliderRange: Story = {
  render: () => <Fixture zoomPercent={900} />,
};

/** Any other workbench renders nothing at all. */
export const NotViewerWorkbench: Story = {
  render: () => <Fixture workbench="fileManager" />,
};

/**
 * The controls driving real state: the zoom actions publish through the same
 * subscription the component registers, which is how the app wires them.
 */
export const Live: Story = {
  render: function Live() {
    const [zoom, setZoom] = useState(100);
    const listener = useRef<((pct: number) => void) | null>(null);

    const publish = useCallback((pct: number) => {
      const clamped = Math.min(Math.max(pct, 20), 500);
      setZoom(clamped);
      listener.current?.(clamped);
    }, []);

    const viewer = useMemo(
      () =>
        ({
          getZoomState: () => ({ zoomPercent: zoom }),
          registerImmediateZoomUpdate: (cb: (pct: number) => void) => {
            listener.current = cb;
            return () => {
              listener.current = null;
            };
          },
          zoomActions: {
            zoomIn: () => publish(zoom + 25),
            zoomOut: () => publish(zoom - 25),
            setZoomLevel: (level: number) => publish(level * 100),
          },
          // Rebuilt per zoom so the seed value stays current.
        }) as unknown as ViewerContextType,
      [zoom, publish],
    );

    return (
      <NavigationStateContext.Provider value={navState("viewer")}>
        <ViewerContext.Provider value={viewer}>
          <ViewerInlineControls />
        </ViewerContext.Provider>
      </NavigationStateContext.Provider>
    );
  },
};
