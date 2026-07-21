import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import LanguagePicker from "@app/components/tools/ocr/LanguagePicker";

const meta = {
  title: "Tools/OCR/LanguagePicker",
  component: LanguagePicker,
  args: {
    value: [],
    onChange: () => {},
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/ui-data/ocr-pdf", () =>
          HttpResponse.json({
            languages: ["eng", "fra", "deu", "spa", "ita", "por"],
          }),
        ),
      ],
    },
  },
} satisfies Meta<typeof LanguagePicker>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Controlled wrapper so selecting/removing languages actually updates the picker. */
function LanguagePickerDemo({
  initialValue = [],
  disabled,
}: {
  initialValue?: string[];
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string[]>(initialValue);
  return (
    <LanguagePicker
      value={value}
      onChange={setValue}
      disabled={disabled}
      // Auto-fill would otherwise select a language on mount based on the
      // browser's locale, which would make this story non-deterministic.
      autoFillFromBrowserLanguage={false}
    />
  );
}

/** No languages selected yet, backend list loaded via MSW. */
export const Default: Story = {
  render: () => <LanguagePickerDemo />,
};

/** One language already selected. */
export const WithSelection: Story = {
  render: () => <LanguagePickerDemo initialValue={["eng"]} />,
};

/** Disabled — e.g. while OCR is running elsewhere in the tool panel. */
export const Disabled: Story = {
  render: () => <LanguagePickerDemo initialValue={["eng"]} disabled />,
};
