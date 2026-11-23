import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";

/** The Stamp Text field's sidebar help: what the text is, then every @ variable it can hold. */
export const useStampTextTips = (): SidebarTooltipContent => {
  const { t } = useTranslation();
  const variable = (name: string, description: string) =>
    `${name} — ${description}`;

  return {
    header: { title: t("AddStampRequest.stampText", "Stamp Text") },
    tips: [
      {
        title: t("AddStampRequest.stampTextTips.title", "What gets printed"),
        description: t(
          "AddStampRequest.stampTextTips.description",
          "This text is printed on every stamped page. Words that start with @ are variables, filled in when the stamp is applied.",
        ),
        bullets: [
          t(
            "AddStampRequest.stampTextTips.newLine",
            "Type \\n to start a new line",
          ),
          t(
            "AddStampRequest.stampTextTips.literalAt",
            "Type @@ for a literal @",
          ),
        ],
      },
      {
        title: t("AddStampRequest.dateTimeVars", "Date & Time"),
        bullets: [
          variable(
            "@date",
            `${t("AddStampRequest.dateDesc", "Current date")} (YYYY-MM-DD)`,
          ),
          variable(
            "@time",
            `${t("AddStampRequest.timeDesc", "Current time")} (HH:mm:ss)`,
          ),
          variable(
            "@datetime",
            t("AddStampRequest.datetimeDesc", "Date and time combined"),
          ),
          variable(
            "@date{dd/MM/yyyy}",
            t("AddStampRequest.customDateDesc", "Custom format"),
          ),
          variable(
            "@year @month @day",
            t("AddStampRequest.yearMonthDayDesc", "Individual date parts"),
          ),
        ],
      },
      {
        title: t("AddStampRequest.pageVars", "Page Information"),
        bullets: [
          variable(
            "@page_number",
            t("AddStampRequest.pageNumberDesc", "Current page number"),
          ),
          variable(
            "@total_pages",
            t("AddStampRequest.totalPagesDesc", "Total number of pages"),
          ),
        ],
      },
      {
        title: t("AddStampRequest.fileVars", "File Information"),
        bullets: [
          variable(
            "@filename",
            t("AddStampRequest.filenameDesc", "Filename without extension"),
          ),
          variable(
            "@filename_full",
            t("AddStampRequest.filenameFullDesc", "Filename with extension"),
          ),
        ],
      },
      {
        title: t("AddStampRequest.metadataVars", "Document Metadata"),
        bullets: [
          variable(
            "@author @title @subject",
            t("AddStampRequest.metadataDesc", "From PDF document properties"),
          ),
        ],
      },
      {
        title: t("AddStampRequest.otherVars", "Other"),
        bullets: [
          variable(
            "@uuid",
            t("AddStampRequest.uuidDesc", "Short unique identifier (8 chars)"),
          ),
        ],
      },
      {
        title: t("AddStampRequest.examples", "Examples"),
        bullets: [
          "Page @page_number of @total_pages",
          "Created: @date{dd/MM/yyyy HH:mm}",
          "© @year @author",
          `@filename\\n@date (${t("AddStampRequest.multiLine", "multi-line")})`,
        ],
      },
    ],
  };
};
