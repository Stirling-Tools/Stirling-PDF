import { useContext, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@editor/ui/Select";
import { LanguagesInUse } from "@editor/tools/pdfTextEditor/components/inspector/languagesInUse";
import {
  filterLanguages,
  languageOptions,
  type LanguageOption,
} from "@editor/tools/pdfTextEditor/util/languageOptions";

/**
 * A searchable language list for text read in `own`, else in `inherited`.
 * The language shown is muted while it is only the inherited one, or the
 * same as it; with neither, `placeholder` shows. A language set apart from
 * the inherited one can be cleared, calling onChange with null.
 *
 * Languages the document uses are listed first. A tag the list lacks, as a
 * file may have or a user may type, becomes an option of its own.
 */
export function LanguagePicker({
  own,
  inherited,
  placeholder,
  onChange,
  label,
  testId,
  disabled,
}: {
  own: string | null;
  inherited: string | null;
  placeholder: string;
  onChange: (lang: string | null) => void;
  label: string;
  testId: string;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const inUse = useContext(LanguagesInUse);
  const [typed, setTyped] = useState("");
  // The click that focuses the field selects its text, so typing replaces
  // the language; a later click places the caret to edit its code.
  const selectOnMouseUp = useRef(false);
  const shown = own ?? inherited;
  const options = useMemo(() => {
    const groups = languageOptions(shown, i18n.language, typed, inUse);
    const toOption = ({ tag, label }: LanguageOption) => ({
      value: tag,
      label,
    });
    if (groups.inUse.length === 0) return groups.others.map(toOption);
    return [
      {
        group: t(
          "pdfTextEditor.inspector.language.inDocument",
          "In this document",
        ),
        options: groups.inUse.map(toOption),
      },
      {
        group: t(
          "pdfTextEditor.inspector.language.allLanguages",
          "All languages",
        ),
        options: groups.others.map(toOption),
      },
    ];
  }, [shown, i18n.language, typed, inUse, t]);
  return (
    <div
      data-testid={testId}
      onFocus={(e) => {
        if (e.target instanceof HTMLInputElement) e.target.select();
      }}
      onMouseDown={(e) => {
        selectOnMouseUp.current = e.target !== document.activeElement;
      }}
      onMouseUp={(e) => {
        if (!selectOnMouseUp.current) return;
        selectOnMouseUp.current = false;
        if (e.target instanceof HTMLInputElement) {
          e.preventDefault();
          e.target.select();
        }
      }}
    >
      <Select
        searchable
        onSearchChange={setTyped}
        filter={filterLanguages}
        allowDeselect={false}
        clearable={own !== null && own !== inherited}
        muted={own === null || own === inherited}
        disabled={disabled}
        inputSize="sm"
        options={options}
        value={shown}
        placeholder={placeholder}
        nothingFoundMessage={t(
          "pdfTextEditor.inspector.language.noMatch",
          "No matching language. Type its code instead, such as mt or en-IE.",
        )}
        onChange={(picked) => {
          if (picked === null) {
            if (own !== null) onChange(null);
          } else if (picked !== shown) {
            onChange(picked);
          }
        }}
        aria-label={label}
      />
    </div>
  );
}
