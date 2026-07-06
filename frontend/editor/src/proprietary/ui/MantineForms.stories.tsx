import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField } from "@app/ui/FormField";
import { Stack } from "@app/ui/Stack";
import { MultiSelect } from "@app/ui/MultiSelect";
import { NumberInput } from "@app/ui/NumberInput";
import { ColorInput } from "@app/ui/ColorInput";
import { Select } from "@app/ui/Select";
import { Slider } from "@app/ui/Slider";

const PII_OPTIONS = [
  { value: "ssn", label: "Social Security Number" },
  { value: "dob", label: "Date of Birth" },
  { value: "account", label: "Account Number" },
  { value: "email", label: "Email Address" },
  { value: "phone", label: "Phone Number" },
  { value: "address", label: "Postal Address" },
  { value: "passport", label: "Passport Number" },
  { value: "license", label: "Driver's License" },
];

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

// ─── MultiSelect ─────────────────────────────────────────────────────────────

export const MultiSelect_Default: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <FormField
          label="PII field types"
          helperText="Select all entity types to detect."
        >
          <MultiSelect
            data={PII_OPTIONS}
            value={value}
            onChange={setValue}
            placeholder="Choose types…"
            clearable
            searchable
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const MultiSelect_WithValues: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState(["ssn", "dob", "email"]);
      return (
        <FormField label="PII field types">
          <MultiSelect
            data={PII_OPTIONS}
            value={value}
            onChange={setValue}
            clearable
            searchable
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const MultiSelect_SmSize: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState(["ssn", "email"]);
      return (
        <FormField label="Fields">
          <MultiSelect
            data={PII_OPTIONS}
            value={value}
            onChange={setValue}
            inputSize="sm"
            clearable
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const MultiSelect_Error: Story = {
  render: () => (
    <FormField
      label="PII field types"
      error="At least one field type is required."
      required
    >
      <MultiSelect
        data={PII_OPTIONS}
        value={[]}
        onChange={() => {}}
        placeholder="Choose types…"
        invalid
        error="At least one field type is required."
      />
    </FormField>
  ),
};

export const MultiSelect_Disabled: Story = {
  render: () => (
    <FormField label="PII field types">
      <MultiSelect
        data={PII_OPTIONS}
        value={["ssn", "dob"]}
        onChange={() => {}}
        disabled
      />
    </FormField>
  ),
};

// ─── NumberInput ─────────────────────────────────────────────────────────────

export const NumberInput_Default: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState<number | string>(100);
      return (
        <FormField label="Max pages" helperText="Maximum pages per run.">
          <NumberInput
            value={value}
            onChange={setValue}
            min={1}
            max={10000}
            step={1}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const NumberInput_Decimal: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState<number | string>(0.85);
      return (
        <FormField
          label="Confidence threshold"
          helperText="Documents below this score route to the review queue."
        >
          <NumberInput
            value={value}
            onChange={setValue}
            min={0}
            max={1}
            step={0.01}
            decimalScale={2}
            fixedDecimalScale
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const NumberInput_WithUnit: Story = {
  render: () => {
    function Bound() {
      const [opacity, setOpacity] = useState<number | string>(80);
      const [fontSize, setFontSize] = useState<number | string>(24);
      return (
        <Stack gap="4">
          <FormField label="Watermark opacity">
            <NumberInput
              value={opacity}
              onChange={setOpacity}
              min={0}
              max={100}
              step={5}
              suffix="%"
            />
          </FormField>
          <FormField label="Font size">
            <NumberInput
              value={fontSize}
              onChange={setFontSize}
              min={6}
              max={200}
              step={1}
              suffix=" pt"
            />
          </FormField>
        </Stack>
      );
    }
    return <Bound />;
  },
};

export const NumberInput_SmSize: Story = {
  render: () => {
    function Bound() {
      const [v, setV] = useState<number | string>(12);
      return (
        <FormField label="Rotation">
          <NumberInput
            value={v}
            onChange={setV}
            min={-360}
            max={360}
            step={1}
            suffix="°"
            inputSize="sm"
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const NumberInput_Error: Story = {
  render: () => (
    <FormField label="Max pages" error="Must be between 1 and 10 000." required>
      <NumberInput
        value={-5}
        onChange={() => {}}
        invalid
        error="Must be between 1 and 10 000."
      />
    </FormField>
  ),
};

export const NumberInput_Disabled: Story = {
  render: () => (
    <FormField label="Max pages">
      <NumberInput value={100} onChange={() => {}} disabled />
    </FormField>
  ),
};

// ─── ColorInput ──────────────────────────────────────────────────────────────

export const ColorInput_Default: Story = {
  render: () => {
    function Bound() {
      const [color, setColor] = useState("");
      return (
        <FormField
          label="Watermark color"
          helperText="Pick a hex colour for the overlay text."
        >
          <ColorInput value={color} onChange={setColor} placeholder="#000000" />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const ColorInput_Preselected: Story = {
  render: () => {
    function Bound() {
      const [color, setColor] = useState("#3B82F6");
      return (
        <FormField label="Accent color">
          <ColorInput value={color} onChange={setColor} />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const ColorInput_SmSize: Story = {
  render: () => {
    function Bound() {
      const [color, setColor] = useState("#EF4444");
      return (
        <FormField label="Badge color">
          <ColorInput value={color} onChange={setColor} inputSize="sm" />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const ColorInput_Error: Story = {
  render: () => (
    <FormField
      label="Watermark color"
      error="Enter a valid hex colour."
      required
    >
      <ColorInput
        value="not-a-color"
        onChange={() => {}}
        invalid
        error="Enter a valid hex colour."
      />
    </FormField>
  ),
};

export const ColorInput_Disabled: Story = {
  render: () => (
    <FormField label="Watermark color">
      <ColorInput value="#3B82F6" onChange={() => {}} disabled />
    </FormField>
  ),
};

// ─── Select ──────────────────────────────────────────────────────────────────

const RETENTION_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days (default)" },
  { value: "180", label: "180 days" },
  { value: "never", label: "Never expire" },
];

export const Select_Default: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState<string | null>("90");
      return (
        <FormField label="Retention period">
          <Select
            options={RETENTION_OPTIONS}
            value={value}
            onChange={setValue}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Select_Searchable: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <FormField label="Output format" helperText="Start typing to filter.">
          <Select
            options={[
              { value: "pdf", label: "PDF" },
              { value: "pdfa", label: "PDF/A (archival)" },
              { value: "pdfa2", label: "PDF/A-2 (archival)" },
              { value: "pdfua", label: "PDF/UA (accessible)" },
              { value: "docx", label: "Word document (.docx)" },
              { value: "xlsx", label: "Spreadsheet (.xlsx)" },
              { value: "txt", label: "Plain text (.txt)" },
            ]}
            value={value}
            onChange={setValue}
            placeholder="Choose format…"
            searchable
            clearable
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Select_SmSize: Story = {
  render: () => {
    function Bound() {
      const [value, setValue] = useState<string | null>("upload");
      return (
        <FormField label="Run on">
          <Select
            options={[
              { value: "upload", label: "Upload" },
              { value: "export", label: "Export" },
            ]}
            value={value}
            onChange={setValue}
            inputSize="sm"
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Select_Error: Story = {
  render: () => (
    <FormField
      label="Retention period"
      error="A retention period is required."
      required
    >
      <Select
        options={RETENTION_OPTIONS}
        value={null}
        onChange={() => {}}
        placeholder="Choose…"
        invalid
        error="A retention period is required."
      />
    </FormField>
  ),
};

export const Select_Disabled: Story = {
  render: () => (
    <FormField label="Retention period">
      <Select
        options={RETENTION_OPTIONS}
        value="90"
        onChange={() => {}}
        disabled
      />
    </FormField>
  ),
};

// ─── Slider ───────────────────────────────────────────────────────────────────

export const Slider_Default: Story = {
  render: () => {
    function Bound() {
      const [v, setV] = useState(0.85);
      return (
        <FormField
          label="Confidence threshold"
          helperText="Documents below this route to the review queue."
        >
          <Slider
            value={v}
            onChange={setV}
            min={0}
            max={1}
            step={0.01}
            formatValue={(x) => x.toFixed(2)}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Slider_WithMarks: Story = {
  render: () => {
    function Bound() {
      const [days, setDays] = useState(90);
      return (
        <FormField label="Retain artifacts for">
          <Slider
            value={days}
            onChange={setDays}
            min={7}
            max={365}
            step={1}
            formatValue={(d) => `${d}d`}
            marks={[
              { value: 30, label: "30d" },
              { value: 90, label: "90d" },
              { value: 180, label: "180d" },
              { value: 365, label: "1y" },
            ]}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Slider_NoLabel: Story = {
  render: () => {
    function Bound() {
      const [v, setV] = useState(50);
      return (
        <FormField label="Opacity" helperText={`${v}%`}>
          <Slider
            value={v}
            onChange={setV}
            min={0}
            max={100}
            step={1}
            showValue={false}
          />
        </FormField>
      );
    }
    return <Bound />;
  },
};

export const Slider_Disabled: Story = {
  render: () => (
    <FormField label="Confidence threshold">
      <Slider
        value={0.85}
        min={0}
        max={1}
        step={0.01}
        formatValue={(x) => x.toFixed(2)}
        disabled
      />
    </FormField>
  ),
};

// ─── Combined ────────────────────────────────────────────────────────────────

export const WatermarkForm: Story = {
  render: () => {
    function Form() {
      const [color, setColor] = useState("#000000");
      const [opacity, setOpacity] = useState<number | string>(50);
      const [fontSize, setFontSize] = useState<number | string>(24);
      const [piiFields, setPiiFields] = useState<string[]>([]);
      return (
        <Stack gap="4">
          <FormField label="Watermark color">
            <ColorInput value={color} onChange={setColor} />
          </FormField>
          <FormField label="Opacity">
            <NumberInput
              value={opacity}
              onChange={setOpacity}
              min={0}
              max={100}
              suffix="%"
            />
          </FormField>
          <FormField label="Font size">
            <NumberInput
              value={fontSize}
              onChange={setFontSize}
              min={6}
              max={200}
              suffix=" pt"
            />
          </FormField>
          <FormField
            label="Redact PII types"
            helperText="Fields to strip before watermarking."
          >
            <MultiSelect
              data={PII_OPTIONS}
              value={piiFields}
              onChange={setPiiFields}
              placeholder="None"
              clearable
              searchable
            />
          </FormField>
        </Stack>
      );
    }
    return <Form />;
  },
};
