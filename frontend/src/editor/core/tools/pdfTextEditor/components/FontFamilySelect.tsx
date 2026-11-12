import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Group, Loader, Select, Text, Tooltip } from "@mantine/core";
import type { ComboboxData, ComboboxItemGroup } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { alert } from "@editor/components/toast";
import { familyOf } from "@editor/tools/pdfTextEditor/util/fontFamily";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import {
  faceStyleFlags,
  groupByFamily,
  isLocalFontAccessSupported,
  listLocalFonts,
  loadedLocalFonts,
  normaliseName,
  subscribeLocalFonts,
  type LocalFont,
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

const BUILT_IN_NAMES = BUILT_IN_FONT_FAMILIES.map((option) => option.value);

function familyOptions(
  fonts: LocalFont[] | null,
  taken: string[],
): FontFamilyOption[] {
  if (!fonts) return [];
  const hidden = new Set(taken.map(normaliseName));
  const withBold = new Set<string>();
  for (const font of fonts) {
    const flags = faceStyleFlags(font);
    if (flags.bold && !flags.italic) withBold.add(normaliseName(font.family));
  }
  return groupByFamily(fonts).flatMap(({ family }) => {
    const key = normaliseName(family);
    if (hidden.has(key)) return [];
    const options = [{ value: family, label: family }];
    if (withBold.has(key)) {
      options.push({ value: `${family} Bold`, label: `${family} Bold` });
    }
    return options;
  });
}

type DeviceFontNotice = "unavailable" | "none";

interface FontFamilySelectProps {
  value: string | null;
  /**
   * Set when the selection is scanned text, whose `value` is the font the
   * scan matcher drew it in rather than a font of the document. `label` is the
   * matcher's name for that face; `value` is null while no font is in force.
   */
  scanned?: { label?: string };
  /**
   * The fontId of the PDF's own font the selection was changed away from.
   * Listed as a pickable option whose value is that fontId, so the text can be
   * put back in it.
   */
  documentFontId?: string | null;
  onChange: (family: string) => void | Promise<FontPickFailure | null>;
  mixed?: boolean;
  disabled?: boolean;
  touch?: boolean;
}

/** Font picker. Device fonts are additive: no prompt until the user asks. */
export function FontFamilySelect({
  value,
  scanned,
  documentFontId = null,
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

  const serverOptions = useMemo(
    () => familyOptions(serverFonts, BUILT_IN_NAMES),
    [serverFonts],
  );

  const deviceOptions = useMemo(
    () =>
      familyOptions(localFonts, [
        ...BUILT_IN_NAMES,
        ...serverOptions.map((option) => option.value),
      ]),
    [localFonts, serverOptions],
  );

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
      [...BUILT_IN_FONT_FAMILIES, ...serverOptions, ...deviceOptions].some(
        (option) => option.value === family,
      ),
    [serverOptions, deviceOptions],
  );

  // The run's own face when we hold no bytes for it. Shown so the user can see
  // what the text IS, listed disabled so picking it can't substitute Helvetica.
  const documentFamily = useMemo(
    () => (!mixed && value && !isKnown(value) ? value : null),
    [mixed, value, isKnown],
  );

  const data = useMemo<ComboboxData>(() => {
    if (
      serverOptions.length === 0 &&
      deviceOptions.length === 0 &&
      !documentFamily &&
      !documentFontId
    ) {
      return BUILT_IN_FONT_FAMILIES;
    }
    const groups: ComboboxItemGroup[] = [];
    // The current font is listed even when it cannot be picked: a Select whose
    // value has no option keeps the last search text and filters by it.
    const documentItems = [
      ...(documentFontId
        ? [{ value: documentFontId, label: familyOf(documentFontId) }]
        : []),
      ...(documentFamily
        ? [
            {
              value: documentFamily,
              label: scanned?.label ?? documentFamily,
              disabled: true,
            },
          ]
        : []),
    ];
    if (documentItems.length > 0) {
      groups.push({
        group: scanned
          ? t("pdfTextEditor.fontPicker.matchedGroup", "Matched font")
          : t("pdfTextEditor.fontPicker.documentGroup", "Document font"),
        items: documentItems,
      });
    }
    groups.push({
      group: t("pdfTextEditor.fontPicker.builtInGroup", "Built-in fonts"),
      items: BUILT_IN_FONT_FAMILIES,
    });
    if (serverOptions.length > 0) {
      groups.push({
        group: t("pdfTextEditor.fontPicker.serverGroup", "Server fonts"),
        items: serverOptions,
      });
    }
    if (deviceOptions.length > 0) {
      groups.push({
        group: t("pdfTextEditor.fontPicker.deviceGroup", "Device fonts"),
        items: deviceOptions,
      });
    }
    return groups;
  }, [
    serverOptions,
    deviceOptions,
    documentFamily,
    documentFontId,
    scanned,
    t,
  ]);

  const pickFailureText = useCallback(
    (failure: FontPickFailure): string => {
      if (failure === "serverFontFailed")
        return t(
          "pdfTextEditor.fontPicker.serverFontFailed",
          "That server font could not be downloaded. The text was left unchanged.",
        );
      if (failure === "embedFailed")
        return t(
          "pdfTextEditor.fontPicker.embedFailed",
          "This font could not be embedded in the PDF. The text was left unchanged.",
        );
      return t(
        "pdfTextEditor.fontPicker.noGlyphs",
        "This font has no characters for the selected text. The text was left unchanged.",
      );
    },
    [t],
  );

  const applyFamily = useCallback(
    async (family: string) => {
      setNotice(null);
      setApplying(true);
      try {
        const failure = await onChange(family);
        if (failure) {
          alert({
            alertType: "warning",
            title: pickFailureText(failure),
            expandable: false,
          });
        }
      } finally {
        setApplying(false);
      }
    },
    [onChange, pickFailureText],
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
            : scanned
              ? t("pdfTextEditor.fontPicker.scannedText", "Scanned text")
              : t("pdfTextEditor.fontPicker.placeholder", "Font family")
        }
        aria-label={t("pdfTextEditor.fontPicker.label", "Font family")}
        nothingFoundMessage={t(
          "pdfTextEditor.fontPicker.noMatch",
          "No matching font",
        )}
        data-testid="pdf-editor-font-family"
      />
      {supported && deviceOptions.length === 0 && (
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
            : t(
                "pdfTextEditor.fontPicker.deviceFontsNone",
                "No extra device fonts were found.",
              )}
        </Text>
      )}
    </Group>
  );
}
