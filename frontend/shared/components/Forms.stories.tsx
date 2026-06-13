import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField } from "@shared/components/FormField";
import { Input } from "@shared/components/Input";
import { Select } from "@shared/components/Select";
import { Checkbox } from "@shared/components/Checkbox";
import { RadioGroup } from "@shared/components/Radio";
import { Slider } from "@shared/components/Slider";
import { Stack } from "@shared/components/Stack";
import { Inline } from "@shared/components/Inline";

// Inline icon to avoid a cross-layer import; shared/ must not depend on portal/.
function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const meta: Meta = {
  title: "Primitives/Forms",
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ width: "28rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Input_Default: Story = {
  render: () => (
    <FormField
      label="Pipeline name"
      required
      helperText="Lowercase letters and dashes only."
    >
      <Input placeholder="e.g. coi-compliance" />
    </FormField>
  ),
};

export const Input_WithIcon: Story = {
  render: () => (
    <FormField label="Search">
      <Input
        leadingIcon={<SearchIcon size={14} />}
        placeholder="Search Stirling…"
      />
    </FormField>
  ),
};

export const Input_Error: Story = {
  render: () => (
    <FormField label="Email" error="Must be a valid email address" required>
      <Input value="not-an-email" onChange={() => {}} />
    </FormField>
  ),
};

export const Select_Default: Story = {
  render: () => (
    <FormField label="Retention period">
      <Select
        defaultValue="90"
        options={[
          { value: "30", label: "30 days" },
          { value: "60", label: "60 days" },
          { value: "90", label: "90 days (default)" },
          { value: "180", label: "180 days" },
          { value: "never", label: "Never expire" },
        ]}
      />
    </FormField>
  ),
};

export const Checkbox_Single: Story = {
  render: () => (
    <Stack gap="2">
      <Checkbox
        defaultChecked
        label="Notify on pipeline failure (webhook + email)"
      />
      <Checkbox
        label="Send low-confidence docs to review queue"
        description="Confidence below 0.85 routes to a reviewer."
      />
      <Checkbox indeterminate label="Mixed state" />
      <Checkbox disabled label="Disabled (off)" />
      <Checkbox defaultChecked disabled label="Disabled (on)" />
    </Stack>
  ),
};

export const Checkbox_GridOfCategories: Story = {
  render: () => (
    <FormField label="PII categories">
      <Inline gap="2">
        {["SSN", "DOB", "Accounts", "Contacts", "Names", "Addresses"].map(
          (c) => (
            <Checkbox key={c} defaultChecked label={c} />
          ),
        )}
      </Inline>
    </FormField>
  ),
};

export const Radio_Group: Story = {
  render: () => {
    function Bound() {
      const [mode, setMode] = useState<"stirling" | "byok" | "hyok">(
        "stirling",
      );
      return (
        <FormField label="Key mode">
          <RadioGroup
            name="keymode"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "stirling",
                label: "Stirling-managed",
                description: "Stirling generates and rotates keys.",
              },
              {
                value: "byok",
                label: "BYOK (AWS KMS)",
                description: "Bring your own KMS key.",
              },
              {
                value: "hyok",
                label: "HYOK (Enterprise)",
                description: "Stirling never sees the key material.",
              },
            ]}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Radio_Horizontal: Story = {
  render: () => {
    function Bound() {
      const [v, setV] = useState("us");
      return (
        <FormField label="Region">
          <RadioGroup
            name="region"
            direction="horizontal"
            value={v}
            onChange={setV}
            options={[
              { value: "us", label: "US" },
              { value: "eu", label: "EU" },
              { value: "apac", label: "APAC" },
            ]}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Slider_Confidence: Story = {
  render: () => {
    function Bound() {
      const [v, setV] = useState(0.85);
      return (
        <FormField
          label="Minimum confidence"
          helperText="Default 0.85 — gates downstream ops below this threshold."
        >
          <Slider
            value={v}
            min={0}
            max={1}
            step={0.01}
            onChange={setV}
            formatValue={(x) => x.toFixed(2)}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Slider_Retention: Story = {
  render: () => {
    function Bound() {
      const [days, setDays] = useState(90);
      return (
        <FormField label="Retain artifacts for">
          <Slider
            value={days}
            min={7}
            max={365}
            step={1}
            onChange={setDays}
            formatValue={(d) => `${d} days`}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const FullForm: Story = {
  render: () => {
    function Form() {
      const [name, setName] = useState("");
      const [retention, setRetention] = useState("90");
      const [mode, setMode] = useState<"stirling" | "byok" | "hyok">(
        "stirling",
      );
      const [conf, setConf] = useState(0.85);
      const [notify, setNotify] = useState(true);
      const [review, setReview] = useState(false);
      return (
        <Stack gap="4">
          <FormField label="Pipeline name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. coi-compliance"
            />
          </FormField>
          <FormField label="Retention">
            <Select
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              options={[
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
                { value: "365", label: "1 year" },
              ]}
            />
          </FormField>
          <FormField label="Key mode">
            <RadioGroup
              name="km"
              value={mode}
              onChange={setMode}
              options={[
                { value: "stirling", label: "Stirling-managed" },
                { value: "byok", label: "BYOK" },
                { value: "hyok", label: "HYOK" },
              ]}
            />
          </FormField>
          <FormField label="Confidence gate" helperText="Default 0.85.">
            <Slider
              value={conf}
              min={0}
              max={1}
              step={0.01}
              onChange={setConf}
              formatValue={(v) => v.toFixed(2)}
            />
          </FormField>
          <FormField label="Alerts">
            <Stack gap="2">
              <Checkbox
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                label="Notify on failure"
              />
              <Checkbox
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
                label="Send low-confidence to review"
              />
            </Stack>
          </FormField>
        </Stack>
      );
    }
    return <Form />;
  },
};
