import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useFlattenTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("flatten.help.title", "Flatten PDF Guide")
    },
    tips: [
      {
        title: t("flatten.help.overview", "Overview"),
        description: t("flatten.help.overview", "Flattening converts interactive PDF elements into static content. Makes forms non-editable and removes interactivity.")
      },
      {
        title: t("flatten.help.whatGetsFlattened", "What Gets Flattened"),
        description: "",
        bullets: [
          t("flatten.help.fullFlatten", "Full Flatten (default): Text fields, checkboxes, radio buttons, dropdowns, buttons, annotations, and all interactive elements become static images/text."),
          t("flatten.help.formsOnly", "Forms Only: Only form fields become static. Links, bookmarks, comments, and annotations remain interactive.")
        ]
      },
      {
        title: t("flatten.help.whenToFlatten", "When to Flatten"),
        description: "",
        bullets: [
          t("flatten.help.useCase1", "Completed forms: After filling out a form, flatten to prevent further changes"),
          t("flatten.help.useCase2", "Final documents: Create locked versions for record-keeping or distribution"),
          t("flatten.help.useCase3", "Watermarked docs: After adding watermarks, flatten to prevent removal"),
          t("flatten.help.useCase4", "Pre-printed forms: Convert fillable PDFs to printable forms with visible fields"),
          t("flatten.help.useCase5", "Consistency: Ensure PDF looks identical across all viewers and devices")
        ]
      },
      {
        title: t("flatten.help.whatStaysInteractive", "What Stays Interactive (Forms Only mode)"),
        description: "",
        bullets: [
          t("flatten.help.interactive1", "Hyperlinks and web links remain clickable"),
          t("flatten.help.interactive2", "Bookmarks/table of contents for navigation"),
          t("flatten.help.interactive3", "Comments and annotations remain visible and editable"),
          t("flatten.help.interactive4", "Document outline and layers")
        ]
      },
      {
        title: t("flatten.help.important", "Important Notes"),
        description: "",
        bullets: [
          t("flatten.help.note1", "Flattening is permanent - cannot be reversed. Keep original if you need to edit later."),
          t("flatten.help.note2", "File size may increase slightly as form elements become images"),
          t("flatten.help.note3", "Flattened forms cannot be un-flattened - the form data is permanently merged"),
          t("flatten.help.note4", "Digital signatures may be invalidated by flattening")
        ]
      },
      {
        title: t("flatten.help.alternatives", "Alternative to Flattening"),
        description: t("flatten.help.altPermissions", "If you only want to prevent editing, consider using 'Change Permissions' instead of flattening. This keeps the PDF interactive but locked.")
      }
    ]
  };
};
