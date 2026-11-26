import { useTranslation } from "react-i18next";
import type { FileId } from "@editor/types/file";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import { LanguagePicker } from "@editor/tools/pdfTextEditor/components/inspector/LanguagePicker";
import {
  reviewLanguage,
  useReviewLanguage,
} from "@editor/tools/pdfTextEditor/store/reviewLanguage";

/**
 * The document language, set from the report. Shows the review's value while the
 * review has the file open (unsaved edits included), else the checked file's; a pick
 * opens the file in the review, which applies it as an undoable step.
 */
export function ReportLanguageField({
  fileId,
  report,
  onOpenInReview,
}: {
  fileId: FileId;
  report: AccessibilityReport;
  onOpenInReview: () => void;
}) {
  const { t } = useTranslation();
  const { open, requested } = useReviewLanguage();
  const live = open?.fileId === fileId ? open : null;
  const pending = requested?.fileId === fileId ? requested : null;
  const language = pending
    ? pending.language
    : live
      ? live.language
      : (report.summary.language ?? null);
  const editable = live ? live.editable : !report.summary.encrypted;
  const label = t("pdfTextEditor.inspector.language.documentLabel", "Language");
  return (
    <>
      <LanguagePicker
        own={language}
        inherited={null}
        placeholder={t(
          "pdfTextEditor.inspector.language.placeholder",
          "Select language",
        )}
        onChange={(lang) => {
          reviewLanguage.set({ requested: { fileId, language: lang } });
          onOpenInReview();
        }}
        label={label}
        testId="a11y-report-language-picker"
        disabled={!editable}
      />
      {!editable && (
        <p className="a11y-note">
          {t(
            "pdfTextEditor.inspector.language.documentLocked",
            "An encrypted document's language can't be changed here.",
          )}
        </p>
      )}
    </>
  );
}
