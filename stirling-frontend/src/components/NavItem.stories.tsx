import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { NavItem } from './NavItem';
import { SectionDivider } from './SectionDivider';

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
  </svg>
);

const meta: Meta<typeof NavItem> = {
  title: 'Primitives/NavItem',
  component: NavItem,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof NavItem>;

export const Active: Story = {
  args: { id: 'home', label: 'Home', icon: <HomeIcon />, isActive: true },
};

export const Inactive: Story = {
  args: { id: 'editor', label: 'Editor', icon: <HomeIcon /> },
};

export const SidebarMockup: Story = {
  render: () => {
    const [active, setActive] = useState('pipelines');
    const items = [
      { id: 'home',     label: 'Home' },
      'divider',
      { id: 'editor',     label: 'Editor' },
      { id: 'sources',    label: 'Sources' },
      { id: 'pipelines',  label: 'Pipelines' },
      { id: 'documents',  label: 'Documents' },
      'divider',
      { id: 'infra',      label: 'Infrastructure' },
      { id: 'usage',      label: 'Usage & Billing' },
      { id: 'docs',       label: 'Developer Docs' },
    ] as const;
    return (
      <div style={{
        width: 240,
        background: 'var(--color-sidebar-bg)',
        border: '1px solid var(--color-sidebar-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '0.75rem 0',
      }}>
        {items.map((item, idx) =>
          item === 'divider'
            ? <SectionDivider key={`d-${idx}`} />
            : <NavItem key={item.id} {...item} icon={<HomeIcon />} isActive={active === item.id} onClick={setActive} />
        )}
      </div>
    );
  },
};
