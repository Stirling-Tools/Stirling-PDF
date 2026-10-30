import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguagePicker } from "@editor/tools/pdfTextEditor/components/inspector/LanguagePicker";
import { LanguagesInUse } from "@editor/tools/pdfTextEditor/components/inspector/languagesInUse";
import {
  OFFERED_LANGUAGE_TAGS,
  filterLanguages,
  languageOptions,
} from "@editor/tools/pdfTextEditor/util/languageOptions";

const tagsOf = (options: { tag: string }[]) => options.map((o) => o.tag);

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
    expect(tagsOf(languageOptions(null, "en", "HAW").others)).toContain("haw");
  });

  it("offers the code edited inside a shown label", () => {
    expect(
      tagsOf(languageOptions(null, "en", "Spanish (es-AR)").others),
    ).toContain("es-AR");
    expect(
      tagsOf(languageOptions(null, "en", "Spanish (es)-CL").others),
    ).toContain("es-CL");
  });

  it("offers the code edited inside a label naming a region", () => {
    expect(
      tagsOf(languageOptions(null, "en", "English (Ireland) (en-MT)").others),
    ).toContain("en-MT");
  });

  it("offers one option for two spellings of a tag", () => {
    const { inUse, others } = languageOptions("EN-ie", "en", "", ["EN-ie"]);
    expect(tagsOf(inUse)).toEqual(["en-IE"]);
    expect(tagsOf(others)).not.toContain("EN-ie");
    expect(tagsOf(others)).not.toContain("en-IE");
  });

  it("offers nothing extra for text that is not a tag", () => {
    const { inUse, others } = languageOptions(null, "en", "not a language");
    expect(inUse).toEqual([]);
    expect(others).toHaveLength(OFFERED_LANGUAGE_TAGS.length);
  });

  it("keeps the file's own tag when the list lacks it", () => {
    expect(tagsOf(languageOptions("x-klingon", "en").others)).toContain(
      "x-klingon",
    );
  });

  it("lists the document's languages apart from the rest", () => {
    const { inUse, others } = languageOptions(null, "en", "", [
      "fr",
      "x-klingon",
    ]);
    expect(new Set(tagsOf(inUse))).toEqual(new Set(["fr", "x-klingon"]));
    expect(tagsOf(others)).not.toContain("fr");
    expect(others).toHaveLength(OFFERED_LANGUAGE_TAGS.length - 1);
  });
});

describe("filterLanguages", () => {
  const options = [
    {
      group: "In this document",
      items: [{ value: "fr", label: "French (fr)" }],
    },
    {
      group: "All languages",
      items: [
        { value: "es", label: "Spanish (es)" },
        { value: "es-MX", label: "Spanish (Mexico) (es-MX)" },
      ],
    },
  ];
  const valuesFor = (search: string) =>
    filterLanguages({ options, search, limit: Infinity }).flatMap((item) =>
      "items" in item ? item.items.map((i) => i.value) : [item.value],
    );

  it("matches a language by its name", () => {
    expect(valuesFor("fren")).toEqual(["fr"]);
  });

  it("matches the code edited inside a shown label", () => {
    expect(valuesFor("Spanish (es-MX)")).toEqual(["es-MX"]);
    expect(valuesFor("Spanish (es)-M")).toEqual(["es-MX"]);
    expect(valuesFor("Spanish (Mexico) (es-MX)")).toEqual(["es-MX"]);
    expect(valuesFor("Spanish (Mexico) (es)")).toEqual(["es", "es-MX"]);
  });

  it("matches a deprecated code by the tag it stands for", () => {
    const withHebrew = [{ value: "he", label: "Hebrew (he)" }];
    expect(
      filterLanguages({ options: withHebrew, search: "iw", limit: Infinity }),
    ).toEqual(withHebrew);
  });

  it("drops a group left with nothing", () => {
    expect(
      filterLanguages({ options, search: "fren", limit: Infinity }),
    ).toHaveLength(1);
  });
});

function renderPicker(
  props: Partial<Parameters<typeof LanguagePicker>[0]> = {},
  inUse: string[] = [],
) {
  const onChange = vi.fn();
  render(
    <MantineProvider env="test">
      <LanguagesInUse.Provider value={inUse}>
        <LanguagePicker
          own={null}
          inherited={null}
          placeholder="Not set"
          onChange={onChange}
          label="Language"
          testId="picker"
          {...props}
        />
      </LanguagesInUse.Provider>
    </MantineProvider>,
  );
  return {
    onChange,
    input: screen.getByRole("textbox", {
      name: "Language",
    }) as HTMLInputElement,
  };
}

describe("LanguagePicker", () => {
  it("picks a language typed by its code", () => {
    const { onChange, input } = renderPicker();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "haw" } });
    fireEvent.click(screen.getByRole("option", { name: /haw/ }));
    expect(onChange).toHaveBeenCalledWith("haw");
  });

  it("lists the document's languages first", () => {
    const { input } = renderPicker({}, ["ga"]);
    fireEvent.click(input);
    expect(screen.getAllByRole("option")[0]).toHaveAccessibleName(
      /(^|\()ga\)?$/,
    );
  });

  it("selects its text on focus, so typing replaces it", () => {
    const { input } = renderPicker({ own: "fr" });
    act(() => input.focus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(input.value).not.toBe("");
  });

  it("mutes its own tag spelled differently from the inherited one", () => {
    const { input } = renderPicker({ own: "EN-ie", inherited: "en-IE" });
    expect(input.style.color).toBe("var(--c-text-muted)");
    expect(input.value).toMatch(/(^|\()en-IE\)?$/);
  });

  it("leaves the language as it is when the inherited one is picked again", () => {
    const { onChange, input } = renderPicker({ inherited: "ga" });
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("option", { name: /(^|\()ga\)?$/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
