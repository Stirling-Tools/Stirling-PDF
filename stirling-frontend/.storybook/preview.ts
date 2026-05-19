import type { Preview } from '@storybook/react';
import { withThemeByDataAttribute } from '@storybook/addon-themes';

import '../src/tokens/tokens.css';
import '../src/tokens/base.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: 'var(--color-bg)' },
        { name: 'surface', value: 'var(--color-surface)' },
      ],
    },
  },
  globalTypes: {
    tier: {
      name: 'Tier',
      description: 'Subscription tier',
      defaultValue: 'pro',
      toolbar: {
        icon: 'star',
        items: [
          { value: 'free', title: 'Free' },
          { value: 'pro', title: 'Pay-as-you-go' },
          { value: 'enterprise', title: 'Enterprise' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
  ],
};

export default preview;
