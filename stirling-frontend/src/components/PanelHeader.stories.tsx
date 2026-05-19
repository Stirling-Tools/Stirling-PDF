import type { Meta, StoryObj } from '@storybook/react';
import { PanelHeader } from './PanelHeader';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof PanelHeader> = {
  title: 'Primitives/PanelHeader',
  component: PanelHeader,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof PanelHeader>;

export const Default: Story = {
  args: { title: 'Pipelines' },
};

export const WithSubtitleAndBack: Story = {
  args: {
    title: 'COI compliance pipeline',
    subtitle: 'Forked from standard · Insurance · Draft',
    onBack: () => {},
  },
};

export const WithActions: Story = {
  args: {
    title: 'API keys',
    subtitle: '12 active · 1 due for rotation',
    actions: (
      <>
        <StatusBadge tone="success">Healthy</StatusBadge>
        <Button variant="outline" size="sm">Rotate key</Button>
        <Button variant="gradient" size="sm">Create key</Button>
      </>
    ),
  },
};
