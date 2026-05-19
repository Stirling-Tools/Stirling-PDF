import { useState } from 'react';
import { Button, StatusBadge, MethodBadge, MetricCard, ProgressBar, ToggleSwitch, NavItem, PanelHeader, CodeBlock, SectionDivider, Card } from './components';

/**
 * Minimal smoke-test app. The real product surfaces live in Storybook for now —
 * this file just proves the design-system primitives mount and theme correctly
 * outside the Storybook chrome. Delete or replace with the real ViewRouter once
 * the app shell lands.
 */
export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toggle, setToggle] = useState(true);

  function flipTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <PanelHeader
        title="Stirling design system"
        subtitle="Smoke test for the component primitives"
        actions={
          <>
            <StatusBadge tone="success" pulse>Live</StatusBadge>
            <Button variant="outline" size="sm" onClick={flipTheme}>
              {theme === 'light' ? 'Dark theme' : 'Light theme'}
            </Button>
          </>
        }
      />

      <div style={{ padding: '1.25rem 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="gradient" trailingIcon={<span aria-hidden>→</span>}>Build a pipeline</Button>
        <Button variant="outline" accent="purple">Connect agent</Button>
        <Button variant="ghost">Skip</Button>
      </div>

      <SectionDivider />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '1.25rem 0' }}>
        <MetricCard label="Agents active"   value={7}     delta={0.4} />
        <MetricCard label="Scenarios"       value={23}    delta={0.1} />
        <MetricCard label="Eval pass rate"  value="94.6%" delta={0.02} />
        <MetricCard label="Docs / 24h"      value="2,481" delta={0.07} />
      </div>

      <SectionDivider />

      <div style={{ padding: '1rem 0', display: 'flex', gap: 16, alignItems: 'center' }}>
        <MethodBadge method="POST" />
        <code style={{ fontFamily: 'var(--font-mono)' }}>/v1/coi</code>
        <ProgressBar value={0.84} thresholded />
        <ToggleSwitch checked={toggle} onChange={setToggle} label="Encryption at rest" />
      </div>

      <NavItem id="home" label="Pipelines" isActive />

      <SectionDivider />

      <Card>
        <CodeBlock
          lang="curl"
          code={`curl https://api.stirling.com/v1/coi \\
  -H "Authorization: Bearer sk_live_a3f8..." \\
  -F "file=@certificate.pdf"`}
        />
      </Card>
    </div>
  );
}
