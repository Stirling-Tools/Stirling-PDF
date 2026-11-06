import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Group, Loader, Select, Text, Tooltip } from "@mantine/core";
import type { ComboboxData, ComboboxItemGroup } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import {
  groupByFamily,
  isLocalFontAccessSupported,
  listLocalFonts,
  loadedLocalFonts,
  normaliseName,
  subscribeLocalFonts,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  loadedServerFonts,
  loadServerFonts,
  subscribeServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";

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

type DeviceFontNotice = "unavailable" | "none" | "serverFontFailed";

interface FontFamilySelectProps {
  value: string | null;
  onChange: (family: string) => void | Promise<boolean>;
  mixed?: boolean;
  disabled?: boolean;
  touch?: boolean;
}

/** Font picker. Device fonts are additive: no prompt until the user asks. */
export function FontFamilySelect({
  value,
  onChange,
  mixed = false,
  disabled = false,
  touch = false,
}: FontFamilySelectProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<DeviceFontNotice | null>(null);
  const supported = useMemo(() => isLocalFontAccessSupported(), []);
  // Read the fonts from the module, not local state: switching files remounts
  // the toolbar, and the grant the user already gave must survive that.
  const localFonts = useSyncExternalStore(
    subscribeLocalFonts,
    loadedLocalFonts,
    loadedLocalFonts,
  );

  const serverFonts = useSyncExternalStore(
    subscribeServerFonts,
    loadedServerFonts,
    loadedServerFonts,
  );

  const serverFamilies = useMemo(() => {
    if (!serverFonts) return [];
    const builtIn = new Set(
      BUILT_IN_FONT_FAMILIES.map((option) => option.value.toLowerCase()),
    );
    return groupByFamily(serverFonts)
      .map((family) => family.family)
      .filter((family) => !builtIn.has(family.toLowerCase()));
  }, [serverFonts]);

  const deviceFamilies = useMemo(() => {
    if (!localFonts) return [];
    const hidden = new Set([
      ...BUILT_IN_FONT_FAMILIES.map((option) => normaliseName(option.value)),
      ...serverFamilies.map(normaliseName),
    ]);
    return groupByFamily(localFonts)
      .map((family) => family.family)
      .filter((family) => !hidden.has(normaliseName(family)));
  }, [localFonts, serverFamilies]);

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
      serverFamilies.includes(family) ||
      deviceFamilies.includes(family),
    [serverFamilies, deviceFamilies],
  );

  // The run's own face when we hold no bytes for it. Shown so the user can see
  // what the text IS, listed disabled so picking it can't substitute Helvetica.
  const documentFamily = useMemo(
    () => (!mixed && value && !isKnown(value) ? value : null),
    [mixed, value, isKnown],
  );

  const data = useMemo<ComboboxData>(() => {
    if (
      serverFamilies.length === 0 &&
      deviceFamilies.length === 0 &&
      !documentFamily
    ) {
      return BUILT_IN_FONT_FAMILIES;
    }
    const groups: ComboboxItemGroup[] = [];
    if (documentFamily) {
      groups.push({
        group: t("pdfTextEditor.fontPicker.documentGroup", "Document font"),
        items: [
          { value: documentFamily, label: documentFamily, disabled: true },
        ],
      });
    }
    groups.push({
      group: t("pdfTextEditor.fontPicker.builtInGroup", "Built-in fonts"),
      items: BUILT_IN_FONT_FAMILIES,
    });
    if (serverFamilies.length > 0) {
      groups.push({
        group: t("pdfTextEditor.fontPicker.serverGroup", "Server fonts"),
        items: serverFamilies.map((family) => ({
          value: family,
          label: family,
        })),
      });
    }
    if (deviceFamilies.length > 0) {
      groups.push({
        group: t("pdfTextEditor.fontPicker.deviceGroup", "Device fonts"),
        items: deviceFamilies.map((family) => ({
          value: family,
          label: family,
        })),
      });
    }
    return groups;
  }, [serverFamilies, deviceFamilies, documentFamily, t]);

  const applyFamily = useCallback(
    async (family: string) => {
      setNotice(null);
      setApplying(true);
      try {
        const applied = await onChange(family);
        if (applied === false) setNotice("serverFontFailed");
      } finally {
        setApplying(false);
      }
    },
    [onChange],
  );

  // Mantine shows nothing for a value with no matching option; the document
  // font is in `data` precisely so a recognised face still gets named.
  const selected = useMemo(() => {
    if (mixed || !value) return null;
    return isKnown(value) || documentFamily === value ? value : null;
  }, [mixed, value, isKnown, documentFamily]);

  return (
    <Group
      gap="xs"
      align="center"
      wrap="nowrap"
      style={touch ? { flex: "1 1 100%" } : undefined}
    >
      <Select
        size={touch ? "lg" : "xs"}
        w={touch ? undefined : 138}
        style={touch ? { flex: 1, minWidth: 0 } : { flexShrink: 0 }}
        searchable
        data={data}
        value={selected}
        onChange={(next) => {
          if (next) void applyFamily(next);
        }}
        onDropdownOpen={() => {
          void loadServerFonts();
        }}
        rightSection={applying ? <Loader size="xs" /> : undefined}
        disabled={disabled || applying}
        placeholder={
          mixed
            ? t("pdfTextEditor.fontPicker.mixed", "Mixed")
            : t("pdfTextEditor.fontPicker.placeholder", "Font family")
        }
        aria-label={t("pdfTextEditor.fontPicker.label", "Font family")}
        nothingFoundMessage={t(
          "pdfTextEditor.fontPicker.noMatch",
          "No matching font",
        )}
        data-testid="pdf-editor-font-family"
      />
      {supported && deviceFamilies.length === 0 && (
        <Tooltip
          label={t(
            "pdfTextEditor.fontPicker.useDeviceFonts",
            "Use device fonts",
          )}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size={touch ? "xl" : "sm"}
            style={{ flexShrink: 0 }}
            loading={loading}
            disabled={disabled || loading}
            onClick={() => {
              void loadDeviceFonts();
            }}
            aria-label={t(
              "pdfTextEditor.fontPicker.useDeviceFonts",
              "Use device fonts",
            )}
            data-testid="pdf-editor-use-device-fonts"
            leftSection={<Icon name="case-sensitive" size={20} />}
          />
        </Tooltip>
      )}
      {notice && (
        <Text size="xs" c="dimmed" data-testid="pdf-editor-device-fonts-notice">
          {notice === "unavailable"
            ? t(
                "pdfTextEditor.fontPicker.deviceFontsUnavailable",
                "Device fonts are unavailable. The built-in fonts still work.",
              )
            : notice === "serverFontFailed"
              ? t(
                  "pdfTextEditor.fontPicker.serverFontFailed",
                  "That server font could not be downloaded. The text was left unchanged.",
                )
              : t(
                  "pdfTextEditor.fontPicker.deviceFontsNone",
                  "No extra device fonts were found.",
                )}
        </Text>
      )}
    </Group>
  );
}
