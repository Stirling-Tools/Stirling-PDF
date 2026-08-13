import { useCallback, useMemo, useState } from "react";
import { Group, Select, Text } from "@mantine/core";
import type { ComboboxData } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import {
  groupByFamily,
  isLocalFontAccessSupported,
  listLocalFonts,
} from "@app/tools/pdfTextEditor/v2/util/localFonts";

export interface FontFamilyOption {
  value: string;
  label: string;
}

/** Base-14 families, renderable by every viewer without embedding. */
export const BUILT_IN_FONT_FAMILIES: FontFamilyOption[] = [
  { value: "Helvetica", label: "Helvetica" },
  { value: "Helvetica-Bold", label: "Helvetica Bold" },
  { value: "Times-Roman", label: "Times Roman" },
  { value: "Times-Bold", label: "Times Bold" },
  { value: "Times-Italic", label: "Times Italic" },
  { value: "Courier", label: "Courier" },
  { value: "Courier-Bold", label: "Courier Bold" },
];

type DeviceFontNotice = "unavailable" | "none";

interface FontFamilySelectProps {
  value: string | null;
  onChange: (family: string) => void;
  mixed?: boolean;
  disabled?: boolean;
}

/** Font picker. Device fonts are additive: no prompt until the user asks. */
export function FontFamilySelect({
  value,
  onChange,
  mixed = false,
  disabled = false,
}: FontFamilySelectProps) {
  const { t } = useTranslation();
  const [deviceFamilies, setDeviceFamilies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<DeviceFontNotice | null>(null);
  const supported = useMemo(() => isLocalFontAccessSupported(), []);

  const loadDeviceFonts = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const fonts = await listLocalFonts();
      if (!fonts) {
        setNotice("unavailable");
        return;
      }
      const builtIn = new Set(
        BUILT_IN_FONT_FAMILIES.map((option) => option.value.toLowerCase()),
      );
      const discovered = groupByFamily(fonts)
        .map((family) => family.family)
        .filter((family) => !builtIn.has(family.toLowerCase()));
      if (discovered.length === 0) setNotice("none");
      setDeviceFamilies(discovered);
    } finally {
      setLoading(false);
    }
  }, []);

  const data = useMemo<ComboboxData>(() => {
    if (deviceFamilies.length === 0) return BUILT_IN_FONT_FAMILIES;
    return [
      {
        group: t("pdfTextEditorV2.fontPicker.builtInGroup", "Built-in fonts"),
        items: BUILT_IN_FONT_FAMILIES,
      },
      {
        group: t("pdfTextEditorV2.fontPicker.deviceGroup", "Device fonts"),
        items: deviceFamilies.map((family) => ({
          value: family,
          label: family,
        })),
      },
    ];
  }, [deviceFamilies, t]);

  // Mantine shows nothing for a value with no matching option, so unknown
  // families (embedded/subset) and mixed selections fall back to the placeholder.
  const selected = useMemo(() => {
    if (mixed || !value) return null;
    const known =
      BUILT_IN_FONT_FAMILIES.some((option) => option.value === value) ||
      deviceFamilies.includes(value);
    return known ? value : null;
  }, [mixed, value, deviceFamilies]);

  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Select
        size="xs"
        w={150}
        searchable
        data={data}
        value={selected}
        onChange={(next) => {
          if (next) onChange(next);
        }}
        disabled={disabled}
        placeholder={
          mixed
            ? t("pdfTextEditorV2.fontPicker.mixed", "Mixed")
            : t("pdfTextEditorV2.fontPicker.placeholder", "Font family")
        }
        aria-label={t("pdfTextEditorV2.fontPicker.label", "Font family")}
        nothingFoundMessage={t(
          "pdfTextEditorV2.fontPicker.noMatch",
          "No matching font",
        )}
        data-testid="v2-font-family"
      />
      {supported && deviceFamilies.length === 0 && (
        <Button
          variant="tertiary"
          size="sm"
          loading={loading}
          disabled={disabled || loading}
          onClick={() => {
            void loadDeviceFonts();
          }}
          data-testid="v2-use-device-fonts"
        >
          {t("pdfTextEditorV2.fontPicker.useDeviceFonts", "Use device fonts")}
        </Button>
      )}
      {notice && (
        <Text size="xs" c="dimmed" data-testid="v2-device-fonts-notice">
          {notice === "unavailable"
            ? t(
                "pdfTextEditorV2.fontPicker.deviceFontsUnavailable",
                "Device fonts are unavailable. The built-in fonts still work.",
              )
            : t(
                "pdfTextEditorV2.fontPicker.deviceFontsNone",
                "No extra device fonts were found.",
              )}
        </Text>
      )}
    </Group>
  );
}
