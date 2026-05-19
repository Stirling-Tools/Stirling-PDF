import type { Meta, StoryObj } from '@storybook/react';
import { MetricCard } from './MetricCard';

const meta: Meta<typeof MetricCard> = {
  title: 'Primitives/MetricCard',
  component: MetricCard,
  parameters: { layout: 'centered' },
  args: { label: 'Docs processed', value: '14,238' },
};
export default meta;
type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {};

export const WithDelta: Story = {
  args: { label: 'Docs processed (24h)', value: '14,238', delta: 0.12, description: 'vs previous 24h' },
};

export const Decrease: Story = {
  args: { label: 'Error rate', value: '0.42%', delta: -0.18, description: 'lower is better' },
};

export const KpiStrip: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, width: 720 }}>
      <MetricCard label="Agents active"    value={7}      delta={0.4} description="vs last week" />
      <MetricCard label="Scenarios"        value={23}     delta={0.1} />
      <MetricCard label="Eval pass rate"   value="94.6%"  delta={0.02} />
      <MetricCard label="Docs / 24h"       value="2,481"  delta={0.07} description="across all agents" />
    </div>
  ),
};

export const Interactive: Story = {
  args: {
    label: 'Sources',
    value: 12,
    description: 'Click to view all',
    onClick: () => alert('navigate to /sources'),
  },
};
