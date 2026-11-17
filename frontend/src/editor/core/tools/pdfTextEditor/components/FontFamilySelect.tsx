import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getParsedComboboxData,
  Group,
  Loader,
  Select,
  Text,
  Tooltip,
} from "@mantine/core";
import type {
  ComboboxData,
  ComboboxItem,
  ComboboxItemGroup,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useServerFontsGroupLabel } from "@editor/tools/pdfTextEditor/hooks/useServerFontsGroupLabel";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import { useFontChangeWarning } from "@editor/tools/pdfTextEditor/components/fontPickFailure";
import {
  familyOf,
  isDocumentFontId,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  BUILT_IN_FAMILIES,
  documentFamilies as groupDocumentFonts,
  externalFamilies,
  fontFamilyKey,
  type FontFamilyEntry,
} from "@editor/tools/pdfTextEditor/util/fontFaces";
import {
  isLocalFontAccessSupported,
  listLocalFontsIfGranted,
  loadedLocalFonts,
  retryLocalFonts,
  subscribeLocalFonts,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  loadedServerFonts,
  loadServerFonts,
  subscribeServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";

function itemOf(entry: FontFamilyEntry): ComboboxItem {
  return { value: entry.value, label: entry.label };
}

function withoutKeys(
  entries: FontFamilyEntry[],
  taken: FontFamilyEntry[],
): FontFamilyEntry[] {
  const keys = new Set(taken.map((entry) => entry.key));
  return entries.filter((entry) => !keys.has(entry.key));
}

type DeviceFontNotice = "unavailable" | "none";

interface FontFamilySelectProps {
  value: string | null;
  /** The selection's fontId, which names the family its face belongs to; null for scanned text. */
  fontId?: string | null;
  /** The document's own fonts as families, offered for the selection's family and the one it can be restored to. */
  documentFamilies?: FontFamilyEntry[];
  /** Set for scanned text: `value` is the matched font (null while none is in force) and `label` the matcher's name for it. */
  scanned?: { label?: string };
  /** The document font the selection was changed from, offered so the text can go back to it. */
  documentFontId?: string | null;
  onChange: (family: string) => void | Promise<FontPickFailure | null>;
  mixed?: boolean;
  disabled?: boolean;
  touch?: boolean;
  /** False renders the list inside the toolbar's own popover rather than portalled out of it. */
  withinPortal?: boolean;
}

/** Font picker. Device fonts are additive: no prompt until the user asks. */
export function FontFamilySelect({
  value,
  fontId = null,
  documentFamilies = [],
  scanned,
  documentFontId = null,
  onChange,
  mixed = false,
  disabled = false,
  touch = false,
  withinPortal = true,
}: FontFamilySelectProps) {
  const { t } = useTranslation();
  const warnAbout = useFontChangeWarning();
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
    () => withoutKeys(externalFamilies(serverFonts), BUILT_IN_FAMILIES),
    [serverFonts],
  );

  const deviceOptions = useMemo(
    () =>
      withoutKeys(externalFamilies(localFonts), [
        ...BUILT_IN_FAMILIES,
        ...serverOptions,
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

  const listed = useMemo(
    () => [...BUILT_IN_FAMILIES, ...serverOptions, ...deviceOptions],
    [serverOptions, deviceOptions],
  );

  const familyHolding = useCallback(
    (face: string | null) =>
      face && isDocumentFontId(face)
        ? (documentFamilies.find((entry) =>
            entry.faces.some((f) => f.value === face),
          ) ??
          groupDocumentFonts([face])[0] ??
          null)
        : null,
    [documentFamilies],
  );

  const restoreFamily = useMemo(
    () => familyHolding(documentFontId),
    [familyHolding, documentFontId],
  );

  const currentKey = useMemo(
    () => (mixed || !value ? null : fontFamilyKey(fontId ?? value)),
    [mixed, value, fontId],
  );

  // The run's own family when no other list names it, so the user can see what the text IS.
  const currentDocumentFamily = useMemo(() => {
    if (!currentKey || listed.some((entry) => entry.key === currentKey))
      return null;
    return (
      familyHolding(fontId) ??
      documentFamilies.find((entry) => entry.key === currentKey) ??
      null
    );
  }, [currentKey, listed, familyHolding, fontId, documentFamilies]);

  // Listed disabled so picking a face we hold no bytes for can't substitute Helvetica.
  const unknownFamily = useMemo(
    () =>
      currentKey &&
      value &&
      !currentDocumentFamily &&
      restoreFamily?.key !== currentKey &&
      !listed.some((entry) => entry.key === currentKey)
        ? value
        : null,
    [currentKey, value, currentDocumentFamily, restoreFamily, listed],
  );

  const data = useMemo<ComboboxData>(() => {
    const documentItems: ComboboxItem[] = [];
    if (restoreFamily) documentItems.push(itemOf(restoreFamily));
    // The text is already in this family and the toggles move it between its faces, so the entry names it and does nothing.
    if (currentDocumentFamily && currentDocumentFamily !== restoreFamily)
      documentItems.push({ ...itemOf(currentDocumentFamily), disabled: true });
    // Always list the current font: a Select whose value has no option filters by stale search text.
    if (unknownFamily)
      documentItems.push({
        value: unknownFamily,
        label: scanned?.label ?? unknownFamily,
        disabled: true,
      });
    if (
      serverOptions.length === 0 &&
      deviceOptions.length === 0 &&
      documentItems.length === 0
    ) {
      return BUILT_IN_FAMILIES.map(itemOf);
    }
    const groups: ComboboxItemGroup[] = [];
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
      items: BUILT_IN_FAMILIES.map(itemOf),
    });
    if (serverOptions.length > 0) {
      groups.push({
        group: serverGroupLabel,
        items: serverOptions.map(itemOf),
      });
    }
    if (deviceOptions.length > 0) {
      groups.push({
        group: t("pdfTextEditor.fontPicker.deviceGroup", "Device fonts"),
        items: deviceOptions.map(itemOf),
      });
    }
    return groups;
  }, [
    serverOptions,
    deviceOptions,
    restoreFamily,
    currentDocumentFamily,
    unknownFamily,
    scanned,
    serverGroupLabel,
    t,
  ]);

  // Mantine shows nothing for a value with no matching option; the document
  // font is in `data` precisely so a recognised face still gets named.
  const selected = useMemo(() => {
    if (!currentKey) return null;
    if (unknownFamily) return unknownFamily;
    const candidates = [...listed, currentDocumentFamily, restoreFamily].filter(
      (entry): entry is FontFamilyEntry => entry !== null,
    );
    const faceNames = fontId ? [fontId, familyOf(fontId)] : [value];
    const entry =
      candidates.find((candidate) =>
        candidate.faces.some((face) => faceNames.includes(face.value)),
      ) ?? candidates.find((candidate) => candidate.key === currentKey);
    return entry?.value ?? null;
  }, [
    currentKey,
    unknownFamily,
    listed,
    currentDocumentFamily,
    restoreFamily,
    fontId,
    value,
  ]);

  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    const option = getParsedComboboxData(data)
      .flatMap((entry) => ("items" in entry ? entry.items : [entry]))
      .find((item) => item.value === selected);
    return option?.label ?? selected;
  }, [data, selected]);

  // Mantine only resyncs its search text when `value` changes, and blur never
  // reaches an input disabled mid-apply, so a refused pick would stay named.
  const [search, setSearch] = useState(selectedLabel);
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const applyFamily = useCallback(
    async (family: string) => {
      setNotice(null);
      setApplying(true);
      try {
        await warnAbout(() => onChange(family));
      } finally {
        setApplying(false);
        setSearch(selectedLabelRef.current);
      }
    },
    [onChange, warnAbout],
  );

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
        comboboxProps={{ withinPortal }}
        data={data}
        value={selected}
        searchValue={search}
        onSearchChange={setSearch}
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
