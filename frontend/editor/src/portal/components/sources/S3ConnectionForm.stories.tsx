import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { S3ConnectionFormValues } from "@portal/components/sources/S3ConnectionForm";
import {
  EMPTY_S3_CONNECTION,
  S3ConnectionForm,
} from "@portal/components/sources/S3ConnectionForm";

const meta: Meta<typeof S3ConnectionForm> = {
  title: "Portal/Sources/S3ConnectionForm",
  component: S3ConnectionForm,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof S3ConnectionForm>;

/** Renders the form and keeps its values in local state, exercising onChange. */
function Controlled({ values }: { values: S3ConnectionFormValues }) {
  const [current, setCurrent] = useState(values);
  return <S3ConnectionForm values={current} onChange={setCurrent} />;
}

export const Empty: Story = {
  render: () => <Controlled values={EMPTY_S3_CONNECTION} />,
};

export const Filled: Story = {
  render: () => (
    <Controlled
      values={{
        name: "Backups bucket",
        bucket: "my-company-inbox",
        region: "us-east-1",
        endpoint: "",
        accessKeyId: "AKIAABCDEFGHIJKLMNOP",
        secretAccessKey: "••••••••••••••••",
      }}
    />
  ),
};
