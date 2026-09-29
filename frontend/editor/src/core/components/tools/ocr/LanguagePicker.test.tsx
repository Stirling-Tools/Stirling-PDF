import { describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import LanguagePicker from "@app/components/tools/ocr/LanguagePicker";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/services/apiClient", () => ({ default: { get: mocks.get } }));

// Only the list the picker would offer matters here, not how the dropdown draws it.
vi.mock("@app/components/shared/DropdownListWithFooter", () => ({
  default: ({ items }: { items: { value: string }[] }) => (
    <ul>
      {items.map((item) => (
        <li key={item.value}>{item.value}</li>
      ))}
    </ul>
  ),
}));

vi.mock("@app/components/tools/ocr/OcrRuntimeManager", () => ({
  default: () => null,
}));

// Stable across renders: the fetch effect depends on both.
const translation = vi.hoisted(() => ({
  t: (key: string, fallback?: string) => fallback ?? key,
  i18n: { language: "en" },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => translation }));

const picker = (endpoint: string) => (
  <MantineProvider>
    <LanguagePicker
      value={[]}
      onChange={() => {}}
      languagesEndpoint={endpoint}
      autoFillFromBrowserLanguage={false}
    />
  </MantineProvider>
);

describe("LanguagePicker", () => {
  test("a list that arrives late does not replace a newer one", async () => {
    let answerFirst!: (value: unknown) => void;
    let answerSecond!: (value: unknown) => void;
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerSecond = resolve;
          }),
      );

    const { rerender } = render(picker("/first"));
    rerender(picker("/second"));

    await act(async () => answerSecond({ data: { languages: ["spa"] } }));
    await act(async () => answerFirst({ data: { languages: ["deu"] } }));

    expect(screen.getByText("spa")).toBeInTheDocument();
    expect(screen.queryByText("deu")).toBeNull();
  });
});
