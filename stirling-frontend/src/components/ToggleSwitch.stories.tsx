import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ToggleSwitch } from './ToggleSwitch';

const meta: Meta<typeof ToggleSwitch> = {
  title: 'Primitives/ToggleSwitch',
  component: ToggleSwitch,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof ToggleSwitch>;

export const Default: Story = {
  render: () => {
    const [on, setOn] = useState(false);
    return <ToggleSwitch checked={on} onChange={setOn} />;
  },
};

export const WithLabel: Story = {
  render: () => {
    const [on, setOn] = useState(true);
    return (
      <ToggleSwitch
        checked={on}
        onChange={setOn}
        label="Encryption at rest"
        description="AES-256 on stored artifacts (Stirling-managed)"
      />
    );
  },
};

export const Disabled: Story = {
  render: () => <ToggleSwitch checked disabled onChange={() => {}} label="HYOK active" description="Enterprise only" />,
};

export const SizeSmall: Story = {
  render: () => {
    const [on, setOn] = useState(true);
    return <ToggleSwitch size="sm" checked={on} onChange={setOn} label="Compact toggle" />;
  },
};
