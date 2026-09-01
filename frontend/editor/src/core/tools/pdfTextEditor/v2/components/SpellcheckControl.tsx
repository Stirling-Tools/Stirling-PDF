import type { CSSProperties } from "react";
import { Group, Select, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "@app/ui/ToggleSwitch";
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
      <Group justify="space-between" wrap="nowrap" gap="sm">
        {/* The row's own text names the switch; passing `label` too would
            print it twice, once either side of the control. */}
        <Text size="xs" id="v2-spellcheck-label">
          {t("pdfTextEditorV2.spellcheck.enable", "Check spelling as you type")}
        </Text>
        <ToggleSwitch
          size="sm"
          checked={pref.enabled}
          onChange={setSpellcheckEnabled}
          aria-labelledby="v2-spellcheck-label"
          data-testid="v2-spellcheck-toggle"
        />
      </Group>
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
    </Stack>
  );
}
