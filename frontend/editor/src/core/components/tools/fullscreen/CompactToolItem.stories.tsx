/**
 * A single row in the fullscreen tool list. What it shows beyond the name is
 * decided elsewhere: the hotkey comes from HotkeyContext, the favourite star
 * and availability from ToolWorkflowContext, and whether premium tools are
 * offered at all from AppConfig.
 *
 * Mounting ToolWorkflowProvider would stand up the whole tool registry and its
 * navigation chain, so the fixture supplies the three fields the row reads.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CompactToolItem from "@app/components/tools/fullscreen/CompactToolItem";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  ToolWorkflowContext,
  type ToolWorkflowContextValue,
} from "@app/contexts/ToolWorkflowContext";
import {
  HotkeyContext,
  type HotkeyContextValue,
} from "@app/contexts/HotkeyContext";

const TOOL: ToolRegistryEntry = {
  icon: <BuildRoundedIcon />,
  name: "Rotate pages",
  // A registry entry with no component and no link is treated as "coming
  // soon" and renders disabled, which would make every story below identical.
  component: () => null,
  description: "Turn pages through 90, 180 or 270 degrees.",
  categoryId: "organise" as never,
  subcategoryId: "pageOperations" as never,
  automationSettings: null,
} as ToolRegistryEntry;

/** Availability is keyed by tool id; anything absent counts as available. */
function fixture({
  isFavorite = false,
  available = true,
}: { isFavorite?: boolean; available?: boolean } = {}) {
  return {
    isFavorite: () => isFavorite,
    toggleFavorite: () => {},
    toolAvailability: available ? {} : { rotate: { available: false } },
  } as unknown as ToolWorkflowContextValue;
}

function Harness({
  tool = TOOL,
  isSelected = false,
  isFavorite = false,
  available = true,
  premiumEnabled = true,
}: {
  tool?: ToolRegistryEntry;
  isSelected?: boolean;
  isFavorite?: boolean;
  available?: boolean;
  premiumEnabled?: boolean;
}) {
  return (
    <AppConfigProvider
      initialConfig={{ premiumEnabled } as never}
      bootstrapMode="non-blocking"
      autoFetch={false}
    >
      {/* The row shows a tool's hotkey when one is bound; none are here. */}
      <HotkeyContext.Provider value={{ hotkeys: {} } as HotkeyContextValue}>
        <ToolWorkflowContext.Provider
          value={fixture({ isFavorite, available })}
        >
          <div style={{ width: 320 }}>
            <CompactToolItem
              id="rotate"
              tool={tool}
              isSelected={isSelected}
              onClick={() => {}}
            />
          </div>
        </ToolWorkflowContext.Provider>
      </HotkeyContext.Provider>
    </AppConfigProvider>
  );
}

const meta: Meta<typeof CompactToolItem> = {
  title: "Tools/Fullscreen/CompactToolItem",
  component: CompactToolItem,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof CompactToolItem>;

export const Default: Story = { render: () => <Harness /> };

export const Selected: Story = { render: () => <Harness isSelected /> };

export const Favourited: Story = { render: () => <Harness isFavorite /> };

/** Alpha tools carry a badge next to the name. */
export const AlphaTool: Story = {
  render: () => (
    <Harness tool={{ ...TOOL, versionStatus: "alpha" } as ToolRegistryEntry} />
  ),
};

/** A long name has to truncate rather than push the row wider. */
export const LongName: Story = {
  render: () => (
    <Harness
      tool={
        {
          ...TOOL,
          name: "Convert scanned documents to searchable PDF with OCR",
        } as ToolRegistryEntry
      }
    />
  ),
};

/** Unavailable tools render disabled, which also hides the favourite star. */
export const Unavailable: Story = {
  render: () => <Harness available={false} />,
};
