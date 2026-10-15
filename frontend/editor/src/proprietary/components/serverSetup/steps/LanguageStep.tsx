import { useTranslation } from "react-i18next";
import { Select } from "@app/ui/Select";
import { supportedLanguages } from "@app/i18n/languages";
import {
  SETUP_DROPDOWN,
  SettingRow,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";

const AUTO_DETECT = "auto";

export function LanguageStep({ draft, update }: SetupStepProps) {
  const { t } = useTranslation();
  const options = [
    {
      value: AUTO_DETECT,
      label: t("serverSetup.language.auto", "Match each browser"),
    },
    ...Object.entries(supportedLanguages).map(([value, label]) => ({
      value,
      label,
    })),
  ];
  return (
    <>
      <SettingRow label={t("serverSetup.language.label", "Default language")}>
        {(labelId) => (
          <Select
            comboboxProps={SETUP_DROPDOWN}
            searchable
            aria-labelledby={labelId}
            options={options}
            value={draft.defaultLocale || AUTO_DETECT}
            onChange={(value) =>
              update({
                defaultLocale: !value || value === AUTO_DETECT ? "" : value,
              })
            }
          />
        )}
      </SettingRow>
    </>
  );
}
