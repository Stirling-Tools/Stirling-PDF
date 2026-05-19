import type { Meta, StoryObj } from '@storybook/react';
import { CodeBlock } from './CodeBlock';

const meta: Meta<typeof CodeBlock> = {
  title: 'Primitives/CodeBlock',
  component: CodeBlock,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof CodeBlock>;

export const Curl: Story = {
  args: {
    lang: 'curl',
    code: `curl https://api.stirling.com/v1/coi \\
  -H "Authorization: Bearer sk_live_a3f8..." \\
  -F "file=@certificate.pdf"`,
  },
};

export const JsonResponse: Story = {
  args: {
    lang: 'json',
    code: `{
  "holder": "Umbrella Corp.",
  "insurer": "Hartford",
  "policy_number": "POL-2026-0142",
  "general_aggregate": 2000000,
  "expiry_date": "2026-12-31",
  "additional_insured": true
}`,
  },
};

export const Python: Story = {
  args: {
    lang: 'python',
    code: `from stirling import Stirling

s = Stirling(api_key="sk_live_a3f8...")
result = s.coi.extract(file="certificate.pdf")
print(result.holder, result.expiry_date)`,
  },
};

export const WithCaption: Story = {
  args: {
    lang: 'typescript',
    caption: 'src/pipelines/coi.ts',
    code: `import { Stirling } from '@stirling/sdk';

const stirling = new Stirling({ apiKey: process.env.STIRLING_KEY! });
const result = await stirling.coi.extract({ file });`,
  },
};
