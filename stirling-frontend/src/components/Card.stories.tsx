import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { MetricCard } from './MetricCard';

const meta: Meta<typeof Card> = {
  title: 'Primitives/Card',
  component: Card,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <h3 style={{ margin: 0, fontSize: 15, color: 'var(--color-text-1)' }}>Set up a PDF pipeline</h3>
      <p style={{ margin: '0.5rem 0 1rem', fontSize: 13, color: 'var(--color-text-4)' }}>
        A pipeline is an easy way to standardise PDF workflows, processes, and policies.
      </p>
      <Button variant="gradient" trailingIcon={<span aria-hidden>→</span>}>New pipeline</Button>
    </Card>
  ),
};

export const Accents: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: 720 }}>
      {(['blue', 'purple', 'green', 'amber', 'red'] as const).map((a) => (
        <Card key={a} accent={a}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.6, color: `var(--color-${a})` }}>
              {a}
            </strong>
            <StatusBadge tone="success" size="sm">Healthy</StatusBadge>
          </div>
          <h4 style={{ margin: '0.5rem 0 0.25rem', fontSize: 14 }}>Card title</h4>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-4)' }}>Accent shown as a 0.25rem strip on the left edge.</p>
        </Card>
      ))}
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card interactive style={{ width: 320 }} onClick={() => alert('open')}>
      <MetricCard label="Docs processed" value="14,238" delta={0.12} description="vs previous 24h" />
    </Card>
  ),
};
