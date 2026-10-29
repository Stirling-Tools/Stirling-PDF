import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@editor/ui/Select";
import { languageOptions } from "@editor/tools/pdfTextEditor/util/languageOptions";

// Not a well-formed language tag, so it cannot collide with one.
const UNSET = "_unset";

/**
 * A searchable language list. The first entry clears the language, read
 * then as `unsetLabel` says; null value means it is clear. A tag the offered
 * list lacks, as a file may have or a user may type, becomes an option of
 * its own.
 */
export function LanguagePicker({
  value,
  unsetLabel,
  onChange,
  label,
  testId,
  disabled,
}: {
  value: string | null;
  unsetLabel: string;
  onChange: (lang: string | null) => void;
  label: string;
  testId: string;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [typed, setTyped] = useState("");
  const options = useMemo(
    () => [
      { value: UNSET, label: unsetLabel },
      ...languageOptions(value, i18n.language, typed).map(({ tag, label }) => ({
        value: tag,
        label,
      })),
    ],
    [value, unsetLabel, i18n.language, typed],
  );
  return (
    <div data-testid={testId}>
      <Select
        searchable
        onSearchChange={setTyped}
        disabled={disabled}
        inputSize="sm"
        options={options}
        value={value ?? UNSET}
        nothingFoundMessage={t(
          "pdfTextEditor.inspector.language.noMatch",
          "No matching language. Type its code instead, such as mt or en-IE.",
        )}
        onChange={(picked) => {
          if (picked === null) return;
          const lang = picked === UNSET ? null : picked;
          if (lang !== value) onChange(lang);
        }}
        aria-label={label}
      />
    </div>
  );
}
