import React from "react";
import { useTranslation } from "react-i18next";
import { AutoRenameParameters } from "@app/hooks/tools/autoRename/useAutoRenameParameters";

interface AutoRenameSettingsProps {
  parameters: AutoRenameParameters;
  onParameterChange: <K extends keyof AutoRenameParameters>(
    parameter: K,
    value: AutoRenameParameters[K],
  ) => void;
  disabled?: boolean;
}

const AutoRenameSettings: React.FC<AutoRenameSettingsProps> = ({
  parameters,
  onParameterChange,
  disabled,
}) => {
  const { t } = useTranslation();

  return (
    <div className="auto-rename-settings">
      <p className="text-muted">
        {t(
          "autoRename.description",
          "This tool will automatically rename PDF files based on their content.",
        )}
      </p>

      <div className="form-group mt-3">
        <label htmlFor="keyword">
          {t("autoRename.keyword", "Keyword (optional)")}
        </label>
        <input
          type="text"
          id="keyword"
          className="form-control"
          placeholder={t("autoRename.keywordPlaceholder", "e.g. Invoice, Date, Name")}
          value={parameters.keyword ?? ""}
          disabled={disabled}
          onChange={(e) => onParameterChange("keyword", e.target.value)}
        />
        <small className="form-text text-muted">
          {t("autoRename.keywordHint", "If provided, the filename will be based on the line containing this keyword.")}
        </small>
      </div>

      <div className="form-check mt-2">
        <input
          type="checkbox"
          id="useTextAfterKeyword"
          className="form-check-input"
          checked={parameters.useTextAfterKeyword ?? false}
          disabled={disabled}
          onChange={(e) => onParameterChange("useTextAfterKeyword", e.target.checked)}
        />
        <label className="form-check-label" htmlFor="useTextAfterKeyword">
          {t("autoRename.useTextAfterKeyword", "Use text after keyword")}
        </label>
      </div>

      <div className="form-check mt-2">
        <input
          type="checkbox"
          id="useRegex"
          className="form-check-input"
          checked={parameters.useRegex ?? false}
          disabled={disabled}
          onChange={(e) => onParameterChange("useRegex", e.target.checked)}
        />
        <label className="form-check-label" htmlFor="useRegex">
          {t("autoRename.useRegex", "Treat keyword as regex pattern")}
        </label>
      </div>

      <div className="form-check mt-2">
        <input
          type="checkbox"
          id="useFirstTextAsFallback"
          className="form-check-input"
          checked={parameters.useFirstTextAsFallback ?? false}
          disabled={disabled}
          onChange={(e) => onParameterChange("useFirstTextAsFallback", e.target.checked)}
        />
        <label className="form-check-label" htmlFor="useFirstTextAsFallback">
          {t("autoRename.useFirstTextAsFallback", "Use first text as fallback")}
        </label>
      </div>
    </div>
  );
};

export default AutoRenameSettings;