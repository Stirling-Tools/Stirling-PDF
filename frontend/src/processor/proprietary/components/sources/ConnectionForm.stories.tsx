import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionForm } from "@processor/components/sources/ConnectionForm";
import {
  CREATABLE_CONNECTION_TYPES,
  emptyConnectionValues,
} from "@processor/components/sources/connectionTypes";

const s3Type = CREATABLE_CONNECTION_TYPES.find((type) => type.id === "s3")!;
const apiType = CREATABLE_CONNECTION_TYPES.find((type) => type.id === "api")!;
const purviewType = CREATABLE_CONNECTION_TYPES.find(
  (type) => type.id === "purview",
)!;

const meta = {
  title: "Portal/Sources/ConnectionForm",
  component: ConnectionForm,
  parameters: { layout: "padded" },
  args: {
    type: s3Type,
    values: emptyConnectionValues(s3Type),
    onChange: () => {},
  },
} satisfies Meta<typeof ConnectionForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The custom API preset exercises `visibleWhen`: picking a select value reveals extra fields
// (username/password for BASIC auth) that stay hidden for the other auth types.
export const ConditionalFieldsRevealed: Story = {
  args: {
    type: apiType,
    values: {
      ...emptyConnectionValues(apiType),
      name: "Internal API",
      authType: "BASIC",
    },
  },
};

// A partially filled preset, showing helper text and required-field markers together.
export const Filled: Story = {
  args: {
    type: purviewType,
    values: {
      ...emptyConnectionValues(purviewType),
      name: "Purview",
      tenantId: "00000000-0000-0000-0000-000000000000",
    },
  },
};
