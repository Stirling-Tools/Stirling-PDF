import type { CSSProperties } from "react";
import { Select, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@app/ui/Checkbox";
import {
  SPELLCHECK_AUTO,
  SPELLCHECK_LANGUAGES,
  setSpellcheckEnabled,
  setSpellcheckLang,
  useSpellcheckPreference,
} from "@app/tools/pdfTextEditor/v2/util/spellcheck";

interface SpellcheckControlProps {
  className?: string;
  style?: CSSProperties;
}

/** Localised language name, falling back to the module's English label. */
function languageLabel(tag: string, fallback: string, uiLang: string): string {
  try {
    if (typeof Intl.DisplayNames === "undefined") return fallback;
    return (
      new Intl.DisplayNames([uiLang], { type: "language" }).of(tag) ?? fallback
    );
  } catch {
    /* unknown UI locale or tag - the English label still reads fine */
    return fallback;
  }
}

/** Spell-check on/off plus dictionary language. Self-contained. */
export function SpellcheckControl({
  className,
  style,
}: SpellcheckControlProps) {
  const { t, i18n } = useTranslation();
  const pref = useSpellcheckPreference();
  const options = [
    {
      value: SPELLCHECK_AUTO,
      label: t("pdfTextEditorV2.spellcheck.auto", "Automatic"),
    },
    ...SPELLCHECK_LANGUAGES.map((lang) => ({
      value: lang.tag,
      label: languageLabel(lang.tag, lang.label, i18n.language),
    })),
  ];
  // A tag persisted by another build (or a newer list) would otherwise
  // leave the Select looking empty.
  const known = options.some((o) => o.value === pref.lang);
  if (!known) options.push({ value: pref.lang, label: pref.lang });

  return (
    <Stack
      gap="xs"
      className={className}
      style={style}
      data-testid="v2-spellcheck"
    >
      <Text size="xs" fw={500}>
        {t("pdfTextEditorV2.spellcheck.title", "Spell check")}
      </Text>
      <Checkbox
        checked={pref.enabled}
        onChange={(e) => setSpellcheckEnabled(e.currentTarget.checked)}
        label={t(
          "pdfTextEditorV2.spellcheck.enable",
          "Check spelling as you type",
        )}
        data-testid="v2-spellcheck-toggle"
      />
      <Select
        size="xs"
        data={options}
        value={pref.lang}
        onChange={(value) => setSpellcheckLang(value ?? SPELLCHECK_AUTO)}
        disabled={!pref.enabled}
        aria-label={t(
          "pdfTextEditorV2.spellcheck.language",
          "Dictionary language",
        )}
        data-testid="v2-spellcheck-language"
      />
      <Text size="xs" c="dimmed">
        {t(
          "pdfTextEditorV2.spellcheck.hint",
          "Uses your browser's own dictionaries. Right-click a marked word for suggestions.",
        )}
      </Text>
    </Stack>
  );
}
