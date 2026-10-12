import type { Meta, StoryObj } from "@storybook/react-vite";
import StorageStatsCard from "@app/components/StorageStatsCard";
import { StorageStats } from "@app/services/fileStorage";

const storageStats: StorageStats = {
  used: 128 * 1024 * 1024,
  available: 512 * 1024 * 1024,
  fileCount: 12,
  quota: 512 * 1024 * 1024,
};

const meta = {
  title: "Components/StorageStatsCard",
  component: StorageStatsCard,
  parameters: { layout: "padded" },
  args: {
    storageStats,
    filesCount: 12,
    onClearAll: () => {},
    onReloadFiles: () => {},
  },
} satisfies Meta<typeof StorageStatsCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NearingQuota: Story = {
  args: {
    storageStats: {
      ...storageStats,
      used: 460 * 1024 * 1024,
      fileCount: 48,
    },
    filesCount: 48,
  },
};

export const NoQuota: Story = {
  args: {
    storageStats: {
      used: 32 * 1024 * 1024,
      available: 0,
      fileCount: 3,
    },
    filesCount: 3,
  },
};
