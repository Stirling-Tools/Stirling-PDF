import type { Meta, StoryObj } from "@storybook/react-vite";
import CardSelector from "@app/components/shared/CardSelector";
import {
  METHOD_OPTIONS,
  type MethodOption,
  type SplitMethod,
} from "@app/constants/splitConstants";

/**
 * A stack of choice cards, each labelled from an i18n prefix + name pair.
 * Driven here by the Split tool's real method options rather than invented
 * keys, so the labels are the ones users actually see and the story does not
 * introduce translation keys that have to be maintained.
 */
const meta: Meta<typeof CardSelector<SplitMethod, MethodOption>> = {
  title: "Shared/CardSelector",
  component: CardSelector,
  parameters: { layout: "padded" },
  args: { onSelect: () => {} },
};
export default meta;

type Story = StoryObj<typeof CardSelector<SplitMethod, MethodOption>>;

/** Every split method. */
export const Default: Story = { args: { options: METHOD_OPTIONS } };

/** A short list — two choices. */
export const FewOptions: Story = {
  args: { options: METHOD_OPTIONS.slice(0, 2) },
};

/** A single choice, where the selector is really just a confirmation. */
export const SingleOption: Story = {
  args: { options: METHOD_OPTIONS.slice(0, 1) },
};

/** Inert while the tool is busy or its endpoint is still resolving. */
export const Disabled: Story = {
  args: { options: METHOD_OPTIONS, disabled: true },
};

/** Nothing available — e.g. every method needs an endpoint that is switched
 *  off. */
export const Empty: Story = { args: { options: [] } };
