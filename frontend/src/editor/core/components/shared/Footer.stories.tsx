import type { Meta, StoryObj } from "@storybook/react-vite";
import Footer from "@app/components/shared/Footer";

const meta = {
  title: "Shared/Footer",
  component: Footer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Footer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Defaults: no overrides supplied, only the always-present links render. */
export const Default: Story = {
  args: {},
};

/** All optional legal links populated, plus the cookie preferences button. */
export const AllLinksAndCookieBanner: Story = {
  args: {
    privacyPolicy: "https://example.com/privacy",
    termsAndConditions: "https://example.com/terms",
    accessibilityStatement: "https://example.com/accessibility",
    cookiePolicy: "https://example.com/cookies",
    impressum: "https://example.com/impressum",
    analyticsEnabled: true,
  },
};
