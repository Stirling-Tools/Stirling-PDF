import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeBlock } from "@shared/components/CodeBlock";

const CURL_EXAMPLE = `curl https://api.stirling.com/v1/coi \\
  -H "Authorization: Bearer sk_live_a3f8..." \\
  -F "file=@certificate.pdf"`;

const JSON_RESULT = `{
  "schema": "coi.v2",
  "fields": {
    "carrier": "Travelers Casualty",
    "policy_number": "PHB-1108-2025",
    "gl_limit": 1000000,
    "umbrella_limit": 5000000,
    "effective": "2026-01-15",
    "expiry": "2027-01-15"
  },
  "confidence_avg": 0.96
}`;

const PYTHON_EXAMPLE = `import stirling

client = stirling.Client(api_key="sk_live_a3f8...")
result = client.extract(file="certificate.pdf", schema="coi.v2")
print(result.fields)`;

const meta: Meta<typeof CodeBlock> = {
  title: "Primitives/CodeBlock",
  component: CodeBlock,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { code: CURL_EXAMPLE, lang: "curl", copyable: true, maxHeight: 400 },
  argTypes: {
    lang: {
      control: "inline-radio",
      options: [
        "json",
        "javascript",
        "typescript",
        "python",
        "bash",
        "curl",
        "http",
        "plain",
      ],
    },
    copyable: { control: "boolean" },
    maxHeight: { control: "number" },
    code: { control: "text" },
  },
};
export default meta;
type Story = StoryObj<typeof CodeBlock>;

/** Flip lang / copyable / maxHeight / code in controls. */
export const Playground: Story = {};

export const LongScrolling: Story = {
  args: {
    code: Array.from(
      { length: 40 },
      (_, i) => `line ${i + 1}: const x = ${i};`,
    ).join("\n"),
    lang: "javascript",
    maxHeight: 240,
  },
};

export const InContext_TwoUpComparison: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <CodeBlock code={CURL_EXAMPLE} lang="curl" caption="Request" />
      <CodeBlock code={JSON_RESULT} lang="json" caption="Response" />
    </div>
  ),
};

export const InContext_Quickstart: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CodeBlock code={PYTHON_EXAMPLE} lang="python" caption="quickstart.py" />
      <CodeBlock code={CURL_EXAMPLE} lang="curl" caption="curl" />
    </div>
  ),
};
