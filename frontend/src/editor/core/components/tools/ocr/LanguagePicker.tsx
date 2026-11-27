import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  getBrowserLanguagesForOcr,
  getOcrDisplayName,
} from "@editor/utils/languageMapping";
import {
  OCR_LANGUAGES_ENDPOINT,
  autoOcrLanguage,
  ocrLanguagesQuery,
} from "@editor/hooks/tools/ocr/ocrLanguages";
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

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  label,
  languagesEndpoint = OCR_LANGUAGES_ENDPOINT,
  autoFillFromBrowserLanguage = true,
}) => {
  const { t, i18n } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("dropdownList.selectLanguages");
  const [hasAutoFilled, setHasAutoFilled] = useState(false);
  const {
    data: languages,
    isPending: isLoadingLanguages,
    error,
  } = useQuery(ocrLanguagesQuery(languagesEndpoint));

  useEffect(() => {
    if (error) {
      console.error("[LanguagePicker] Fetch failed with error:", error);
    }
  }, [error]);

  const availableLanguages = useMemo<DropdownItem[]>(() => {
    if (!languages) {
      return [];
    }

    const displayNames =
      typeof Intl.DisplayNames !== "undefined"
        ? new Intl.DisplayNames([i18n.language], { type: "language" })
        : null;

    return [...new Set(languages)]
      .map((lang) => {
        const displayName = getOcrDisplayName(lang);
        const browserLanguageCodes = getBrowserLanguagesForOcr(lang);

        const langKey = `lang.${lang}`;
        const translatedFromKey = t(langKey);
        const hasKeyTranslation = translatedFromKey !== langKey;

        const intlTranslatedName = displayNames
          ? browserLanguageCodes
              .map((code) => displayNames.of(code))
              .find((name): name is string => Boolean(name))
          : null;

        const translatedName =
          (hasKeyTranslation ? translatedFromKey : null) ||
          intlTranslatedName ||
          t(`ocr.languages.${lang}`, displayName);

        return {
          value: lang,
          name: translatedName,
          label: translatedName,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [languages, i18n.language, t]);

  // Auto-fill OCR language based on browser language when languages are loaded
  useEffect(() => {
    const shouldAutoFillLanguage =
      autoFillFromBrowserLanguage &&
      !isLoadingLanguages &&
      availableLanguages.length > 0 &&
      !hasAutoFilled &&
      value.length === 0;

    if (shouldAutoFillLanguage) {
      const matchingLanguage = autoOcrLanguage(
        availableLanguages.map((lang) => lang.value),
        i18n.language,
      );
      if (matchingLanguage) {
        onChange([matchingLanguage]);
      }

      setHasAutoFilled(true);
    }
  }, [
    autoFillFromBrowserLanguage,
    isLoadingLanguages,
    availableLanguages,
    hasAutoFilled,
    value.length,
    i18n.language,
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

  const footer = (
    <>
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
    </>
  );

  return (
    <DropdownListWithFooter
      value={value}
      onChange={(newValue) => onChange(newValue as string[])}
      items={availableLanguages}
      placeholder={resolvedPlaceholder}
      disabled={disabled}
      label={label}
      footer={footer}
      multiSelect={true}
      maxHeight={300}
      searchable={true}
    />
  );
};

export default LanguagePicker;
