import type { CSSProperties, ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Primitives/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'padded' },
  args: { value: 0.45 },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
};
export default meta;
type Story = StoryObj<typeof ProgressBar>;

const sleeve: CSSProperties = { width: 320, display: 'flex', flexDirection: 'column', gap: 8 };

export const Default: Story = {
  render: (args: ComponentProps<typeof ProgressBar>) => (
    <div style={sleeve}>
      <ProgressBar {...args} />
    </div>
  ),
};

export const Thresholded: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={sleeve}>
        <label style={{ fontSize: 12, color: 'var(--color-text-4)' }}>247 / 500 docs (49%)</label>
        <ProgressBar value={0.49} thresholded />
      </div>
      <div style={sleeve}>
        <label style={{ fontSize: 12, color: 'var(--color-text-4)' }}>420 / 500 docs (84%)</label>
        <ProgressBar value={0.84} thresholded />
      </div>
      <div style={sleeve}>
        <label style={{ fontSize: 12, color: 'var(--color-text-4)' }}>485 / 500 docs (97%)</label>
        <ProgressBar value={0.97} thresholded />
      </div>
    </div>
  ),
};

export const Taller: Story = {
  render: () => (
    <div style={sleeve}>
      <ProgressBar value={0.62} height={10} />
    </div>
  ),
};
