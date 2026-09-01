import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Group, Select, Text, Tooltip } from "@mantine/core";
import type { ComboboxData, ComboboxItemGroup } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import FontDownloadIcon from "@mui/icons-material/FontDownloadOutlined";
import {
  groupByFamily,
  isLocalFontAccessSupported,
  listLocalFonts,
  loadedLocalFonts,
  subscribeLocalFonts,
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
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<DeviceFontNotice | null>(null);
  const supported = useMemo(() => isLocalFontAccessSupported(), []);
  // Read the fonts from the module, not local state: switching files remounts
  // the toolbar, and the grant the user already gave must survive that.
  const localFonts = useSyncExternalStore(
    subscribeLocalFonts,
    loadedLocalFonts,
    loadedLocalFonts,
  );

  const deviceFamilies = useMemo(() => {
    if (!localFonts) return [];
    const builtIn = new Set(
      BUILT_IN_FONT_FAMILIES.map((option) => option.value.toLowerCase()),
    );
    return groupByFamily(localFonts)
      .map((family) => family.family)
      .filter((family) => !builtIn.has(family.toLowerCase()));
  }, [localFonts]);

  const loadDeviceFonts = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const fonts = await listLocalFonts();
      // deviceFamilies recomputes off the store, so only the empty outcomes
      // need reporting here.
      if (!fonts) setNotice("unavailable");
      else if (fonts.length === 0) setNotice("none");
    } finally {
      setLoading(false);
    }
  }, []);

  const isKnown = useCallback(
    (family: string) =>
      BUILT_IN_FONT_FAMILIES.some((option) => option.value === family) ||
      deviceFamilies.includes(family),
    [deviceFamilies],
  );

  // The run's own face when we hold no bytes for it. Shown so the user can see
  // what the text IS, listed disabled so picking it can't substitute Helvetica.
  const documentFamily = useMemo(
    () => (!mixed && value && !isKnown(value) ? value : null),
    [mixed, value, isKnown],
  );

  const data = useMemo<ComboboxData>(() => {
    if (deviceFamilies.length === 0 && !documentFamily) {
      return BUILT_IN_FONT_FAMILIES;
    }
    const groups: ComboboxItemGroup[] = [];
    if (documentFamily) {
      groups.push({
        group: t("pdfTextEditorV2.fontPicker.documentGroup", "Document font"),
        items: [
          { value: documentFamily, label: documentFamily, disabled: true },
        ],
      });
    }
    groups.push({
      group: t("pdfTextEditorV2.fontPicker.builtInGroup", "Built-in fonts"),
      items: BUILT_IN_FONT_FAMILIES,
    });
    if (deviceFamilies.length > 0) {
      groups.push({
        group: t("pdfTextEditorV2.fontPicker.deviceGroup", "Device fonts"),
        items: deviceFamilies.map((family) => ({
          value: family,
          label: family,
        })),
      });
    }
    return groups;
  }, [deviceFamilies, documentFamily, t]);

  // Mantine shows nothing for a value with no matching option; the document
  // font is in `data` precisely so a recognised face still gets named.
  const selected = useMemo(() => {
    if (mixed || !value) return null;
    return isKnown(value) || documentFamily === value ? value : null;
  }, [mixed, value, isKnown, documentFamily]);

  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Select
        size="xs"
        w={138}
        style={{ flexShrink: 0 }}
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
        <Tooltip
          label={t(
            "pdfTextEditorV2.fontPicker.useDeviceFonts",
            "Use device fonts",
          )}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            style={{ flexShrink: 0 }}
            loading={loading}
            disabled={disabled || loading}
            onClick={() => {
              void loadDeviceFonts();
            }}
            aria-label={t(
              "pdfTextEditorV2.fontPicker.useDeviceFonts",
              "Use device fonts",
            )}
            data-testid="v2-use-device-fonts"
            leftSection={<FontDownloadIcon fontSize="small" />}
          />
        </Tooltip>
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
