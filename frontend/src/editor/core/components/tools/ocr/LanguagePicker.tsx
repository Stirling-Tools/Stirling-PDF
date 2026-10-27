import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Text, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  getAutoOcrLanguage,
  getBrowserLanguagesForOcr,
  getOcrDisplayName,
} from "@editor/utils/languageMapping";
import apiClient from "@editor/services/apiClient";
import { formatFileSize } from "@editor/utils/fileUtils";
import { extractErrorMessage } from "@editor/utils/toolErrorHandler";
import { Icon } from "@editor/ui/Icon";
import DropdownListWithFooter, {
  DropdownItem,
} from "@editor/components/shared/DropdownListWithFooter";

export interface LanguageOption {
  value: string;
  label: string;
}

export interface LanguagePickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  languagesEndpoint?: string;
  autoFillFromBrowserLanguage?: boolean;
}

const DEFAULT_LANGUAGES_ENDPOINT = "/api/v1/ui-data/ocr-pdf";
export const LANGUAGE_CATALOG_ENDPOINT = "/api/v1/ui-data/ocr-pdf/languages";

interface InstallableLanguage {
  code: string;
  sizeBytes: number;
  source: "DOWNLOAD" | "SYSTEM";
}

interface LanguageCatalog {
  installed: string[];
  installable: InstallableLanguage[];
  canInstall: boolean;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  label,
  languagesEndpoint = DEFAULT_LANGUAGES_ENDPOINT,
  autoFillFromBrowserLanguage = true,
}) => {
  const { t, i18n } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("dropdownList.selectLanguages");
  const [installedLanguages, setInstalledLanguages] = useState<string[]>([]);
  const [installable, setInstallable] = useState<InstallableLanguage[]>([]);
  const [installing, setInstalling] = useState<string[]>([]);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);
  const [hasAutoFilled, setHasAutoFilled] = useState(false);
  // Installs finish after the click that started them; the selection may have moved on.
  const valueRef = useRef(value);
  valueRef.current = value;

  const displayNames = useMemo(
    () =>
      typeof Intl.DisplayNames !== "undefined"
        ? new Intl.DisplayNames([i18n.language], { type: "language" })
        : null,
    [i18n.language],
  );

  const displayName = useCallback(
    (lang: string) => {
      const langKey = `lang.${lang}`;
      const translatedFromKey = t(langKey);
      const hasKeyTranslation = translatedFromKey !== langKey;
      const intlTranslatedName = displayNames
        ? getBrowserLanguagesForOcr(lang)
            .map((code) => displayNames.of(code))
            .find((name): name is string => Boolean(name))
        : null;
      return (
        (hasKeyTranslation ? translatedFromKey : null) ||
        intlTranslatedName ||
        t(`ocr.languages.${lang}`, getOcrDisplayName(lang))
      );
    },
    [displayNames, t],
  );

  const suggested = useMemo(
    () => getAutoOcrLanguage(i18n.language),
    [i18n.language],
  );

  const applyCatalog = useCallback((catalog: LanguageCatalog) => {
    setInstalledLanguages([...new Set(catalog.installed)]);
    setInstallable(catalog.canInstall ? catalog.installable : []);
  }, []);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const { data } = await apiClient.get<{ languages: string[] }>(
          languagesEndpoint,
        );
        setInstalledLanguages([...new Set(data.languages)]);
        // Only the app's own OCR backend can add languages; older servers lack the endpoint.
        if (languagesEndpoint === DEFAULT_LANGUAGES_ENDPOINT) {
          try {
            const catalog = await apiClient.get<LanguageCatalog>(
              LANGUAGE_CATALOG_ENDPOINT,
            );
            applyCatalog(catalog.data);
          } catch {
            setInstallable([]);
          }
        }
      } catch (error) {
        console.error("[LanguagePicker] Fetch failed with error:", error);
      } finally {
        setIsLoadingLanguages(false);
      }
    };

    fetchLanguages();
  }, [languagesEndpoint, applyCatalog]);

  const install = useCallback(
    async (code: string) => {
      setInstalling((current) => [...current, code]);
      setInstallError(null);
      try {
        const { data } = await apiClient.post<LanguageCatalog>(
          `${LANGUAGE_CATALOG_ENDPOINT}/${encodeURIComponent(code)}`,
          undefined,
          { timeout: 0 },
        );
        applyCatalog(data);
        if (data.installed.includes(code) && !valueRef.current.includes(code)) {
          onChange([...valueRef.current, code]);
        }
      } catch (error) {
        setInstallError(
          t(
            "ocr.languagePicker.installFailed",
            "Couldn't add {{language}}: {{reason}}",
            { language: displayName(code), reason: extractErrorMessage(error) },
          ),
        );
      } finally {
        setInstalling((current) => current.filter((c) => c !== code));
      }
    },
    [applyCatalog, displayName, onChange, t],
  );

  const installedItems: DropdownItem[] = useMemo(
    () =>
      installedLanguages
        .map((lang) => ({ value: lang, name: displayName(lang) }))
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [installedLanguages, displayName, i18n.language],
  );

  const sortedInstallable = useMemo(
    () =>
      installable
        .map((language) => ({ language, name: displayName(language.code) }))
        .sort(
          (a, b) =>
            Number(suggested.includes(b.language.code)) -
              Number(suggested.includes(a.language.code)) ||
            a.name.localeCompare(b.name, i18n.language),
        ),
    [installable, displayName, suggested, i18n.language],
  );

  const installableItems: DropdownItem[] = sortedInstallable.map(
    ({ language, name }) => ({
      value: language.code,
      name: t("ocr.languagePicker.installableName", "{{language}} ({{size}})", {
        language: name,
        size: formatFileSize(language.sizeBytes),
      }),
      disabled: installing.includes(language.code),
      leftSection: installing.includes(language.code) ? (
        <Loader size={14} />
      ) : (
        <Icon
          name={language.source === "SYSTEM" ? "hard-drive" : "download"}
          size="1rem"
          title={
            language.source === "SYSTEM"
              ? t(
                  "ocr.languagePicker.fromThisComputer",
                  "Copied from Tesseract on this computer",
                )
              : t("ocr.languagePicker.downloads", "Downloads when picked")
          }
        />
      ),
    }),
  );

  // Only a language the user just picked is installed; anything already in the selection
  // (a saved automation may name languages this machine lacks) is passed through untouched.
  const handleChange = (next: string[]) => {
    const installedSet = new Set(installedLanguages);
    const picked = (code: string) =>
      !value.includes(code) && !installedSet.has(code);
    onChange(next.filter((code) => !picked(code)));
    next
      .filter((code) => picked(code) && !installing.includes(code))
      .forEach((code) => void install(code));
  };

  // Auto-fill OCR language based on browser language when languages are loaded
  useEffect(() => {
    const shouldAutoFillLanguage =
      autoFillFromBrowserLanguage &&
      !isLoadingLanguages &&
      installedLanguages.length > 0 &&
      !hasAutoFilled &&
      value.length === 0;

    if (shouldAutoFillLanguage) {
      const matchingLanguage = installedLanguages.find((lang) =>
        suggested.includes(lang),
      );
      if (matchingLanguage) {
        onChange([matchingLanguage]);
      }
      setHasAutoFilled(true);
    }
  }, [
    autoFillFromBrowserLanguage,
    isLoadingLanguages,
    installedLanguages,
    hasAutoFilled,
    value.length,
    suggested,
    onChange,
  ]);

  if (isLoadingLanguages) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Loader size="xs" />
        <Text size="sm">
          {t("ocr.languagePicker.loading", "Loading available languages...")}
        </Text>
      </div>
    );
  }

  const footer =
    installableItems.length > 0 ? (
      <Text size="xs" c="dimmed" className="text-center">
        {t(
          "ocr.languagePicker.installHint",
          "Languages showing a size are added when you pick them.",
        )}
      </Text>
    ) : (
      <div className="flex flex-col items-center gap-1 text-center">
        <Text size="xs" c="dimmed" className="text-center">
          {t(
            "ocr.languagePicker.additionalLanguages",
            "Looking for additional languages?",
          )}
        </Text>
        <Text
          size="xs"
          style={{
            color: "var(--c-accent-text)",
            cursor: "pointer",
            textDecoration: "underline",
            textAlign: "center",
          }}
          onClick={() =>
            window.open(
              "https://docs.stirlingpdf.com/Configuration/OCR",
              "_blank",
            )
          }
        >
          {t("ocr.languagePicker.viewSetupGuide", "View setup guide →")}
        </Text>
      </div>
    );

  return (
    <>
      <DropdownListWithFooter
        value={value}
        onChange={(newValue) => handleChange(newValue as string[])}
        items={[...installedItems, ...installableItems]}
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        label={label}
        footer={footer}
        multiSelect={true}
        maxHeight={300}
        searchable={true}
      />
      {installError && (
        <Text role="alert" size="xs" c="var(--c-danger)" mt={4}>
          {installError}
        </Text>
      )}
    </>
  );
};

export default LanguagePicker;
