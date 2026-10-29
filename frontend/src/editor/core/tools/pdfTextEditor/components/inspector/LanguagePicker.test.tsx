import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguagePicker } from "@editor/tools/pdfTextEditor/components/inspector/LanguagePicker";
import {
  OFFERED_LANGUAGE_TAGS,
  languageOptions,
} from "@editor/tools/pdfTextEditor/util/languageOptions";

describe("languageOptions", () => {
  it("offers every OCR language and the regional variants", () => {
    expect(OFFERED_LANGUAGE_TAGS.length).toBeGreaterThanOrEqual(100);
    expect(OFFERED_LANGUAGE_TAGS).toEqual(
      expect.arrayContaining([
        "ga",
        "mt",
        "fil",
        "mi",
        "la",
        "en-IE",
        "zh-Hant",
      ]),
    );
    expect(new Set(OFFERED_LANGUAGE_TAGS).size).toBe(
      OFFERED_LANGUAGE_TAGS.length,
    );
  });

  it("offers a typed tag the list lacks, in canonical form", () => {
    const tags = languageOptions(null, "en", "HAW").map((o) => o.tag);
    expect(tags).toContain("haw");
  });

  it("offers nothing extra for text that is not a tag", () => {
    expect(languageOptions(null, "en", "not a language")).toHaveLength(
      OFFERED_LANGUAGE_TAGS.length,
    );
  });

  it("keeps the file's own tag when the list lacks it", () => {
    expect(languageOptions("x-klingon", "en").map((o) => o.tag)).toContain(
      "x-klingon",
    );
  });
});

describe("LanguagePicker", () => {
  it("picks a language typed by its code", () => {
    const onChange = vi.fn();
    render(
      <MantineProvider env="test">
        <LanguagePicker
          value={null}
          unsetLabel="Not set"
          onChange={onChange}
          label="Language"
          testId="picker"
        />
      </MantineProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Language" });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "haw" } });
    fireEvent.click(screen.getByRole("option", { name: /haw/ }));
    expect(onChange).toHaveBeenCalledWith("haw");
  });
});
