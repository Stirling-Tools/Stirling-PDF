import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Group, Loader, Select, Text, Tooltip } from "@mantine/core";
import type { ComboboxData, ComboboxItemGroup } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { alert } from "@editor/components/toast";
import { useServerFontsGroupLabel } from "@editor/tools/pdfTextEditor/hooks/useServerFontsGroupLabel";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import {
  familyOptions,
  isLocalFontAccessSupported,
  listLocalFontsIfGranted,
  loadedLocalFonts,
  retryLocalFonts,
  subscribeLocalFonts,
  type FontFamilyOption,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  loadedServerFonts,
  loadServerFonts,
  subscribeServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";

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

const PICK_FAILURE_TEXT: Record<FontPickFailure, [string, string]> = {
  serverFontFailed: [
    "pdfTextEditor.fontPicker.serverFontFailed",
    "That server font could not be downloaded. The text was left unchanged.",
  ],
  embeddingForbidden: [
    "pdfTextEditor.fontPicker.embeddingForbidden",
    "This font's licence does not allow embedding it in a PDF. The text was left unchanged.",
  ],
  embedFailed: [
    "pdfTextEditor.fontPicker.embedFailed",
    "This font could not be embedded in the PDF. The text was left unchanged.",
  ],
  noGlyphs: [
    "pdfTextEditor.fontPicker.noGlyphs",
    "This font has no characters for the selected text. The text was left unchanged.",
  ],
};

type DeviceFontNotice = "unavailable" | "none";

interface FontFamilySelectProps {
  value: string | null;
  /** Set for scanned text: `value` is the matched font (null while none is in force) and `label` the matcher's name for it. */
  scanned?: { label?: string };
  onChange: (family: string) => void | Promise<FontPickFailure | null>;
  mixed?: boolean;
  disabled?: boolean;
  touch?: boolean;
}

/** Font picker. Device fonts are additive: no prompt until the user asks. */
export function FontFamilySelect({
  value,
  scanned,
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
  const serverGroupLabel = useServerFontsGroupLabel();
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
      const fonts = await retryLocalFonts();
      // deviceFamilies recomputes off the store, so only the empty outcomes
      // need reporting here.
      if (!fonts) setNotice("unavailable");
      else if (fonts.length === 0) setNotice("none");
    } finally {
      setLoading(false);
    }
  }, []);

  // Already allowed, so listing cannot prompt: skip the button.
  useEffect(() => {
    if (supported && !loadedLocalFonts()) void listLocalFontsIfGranted();
  }, [supported]);

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
      !documentFamily
    ) {
      return BUILT_IN_FONT_FAMILIES;
    }
    const groups: ComboboxItemGroup[] = [];
    if (documentFamily) {
      groups.push({
        group: scanned
          ? t("pdfTextEditor.fontPicker.matchedGroup", "Matched font")
          : t("pdfTextEditor.fontPicker.documentGroup", "Document font"),
        items: [
          {
            value: documentFamily,
            label: scanned?.label ?? documentFamily,
            disabled: true,
          },
        ],
      });
    }
    groups.push({
      group: t("pdfTextEditor.fontPicker.builtInGroup", "Built-in fonts"),
      items: BUILT_IN_FONT_FAMILIES,
    });
    if (serverOptions.length > 0) {
      groups.push({
        group: serverGroupLabel,
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
    scanned,
    serverGroupLabel,
    t,
  ]);

  const pickFailureText = useCallback(
    (failure: FontPickFailure): string => {
      const [key, fallback] = PICK_FAILURE_TEXT[failure];
      return t(key, fallback);
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

  const placeholder = useMemo(() => {
    if (mixed) return t("pdfTextEditor.fontPicker.mixed", "Mixed");
    if (scanned)
      return t("pdfTextEditor.fontPicker.scannedText", "Scanned text");
    return t("pdfTextEditor.fontPicker.placeholder", "Font family");
  }, [mixed, scanned, t]);

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
        placeholder={placeholder}
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
