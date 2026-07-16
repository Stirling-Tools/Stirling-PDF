import type { Meta, StoryObj } from "@storybook/react-vite";
import PageEditor from "@app/components/pageEditor/PageEditor";
import { AppProviders } from "@app/components/AppProviders";

// PageEditor takes no required props - all of its state (files, navigation
// guard, page editor document) comes from contexts, which only resolve
// inside the same provider tree the app wraps around it (mirrors
// Workbench.stories.tsx).
const meta = {
  title: "PageEditor/PageEditor",
  component: PageEditor,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof PageEditor>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No files loaded yet - renders the "No PDF files loaded" empty state. */
export const Default: Story = {};
