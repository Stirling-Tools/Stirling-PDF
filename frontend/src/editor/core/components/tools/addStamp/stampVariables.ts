import type { TFunction } from "i18next";

export interface StampVariable {
  /** Tokens that share one description, such as @year, @month and @day. */
  tokens: string[];
  description: string;
}

export interface StampVariableGroup {
  title: string;
  variables: StampVariable[];
}

export interface StampTextExample {
  /** What the stamp text becomes; `\n` is typed as two characters. */
  text: string;
  /** Says what the example shows when the text alone does not. */
  note?: string;
}

/** The @ variables a stamp can hold, grouped as both the picker and the sidebar help list them. */
export function stampVariableGroups(t: TFunction): StampVariableGroup[] {
  return [
    {
      title: t("AddStampRequest.dateTimeVars", "Date & Time"),
      variables: [
        {
          tokens: ["@date"],
          description: `${t("AddStampRequest.dateDesc", "Current date")} (YYYY-MM-DD)`,
        },
        {
          tokens: ["@time"],
          description: `${t("AddStampRequest.timeDesc", "Current time")} (HH:mm:ss)`,
        },
        {
          tokens: ["@datetime"],
          description: t(
            "AddStampRequest.datetimeDesc",
            "Date and time combined",
          ),
        },
        {
          tokens: ["@date{dd/MM/yyyy}"],
          description: t("AddStampRequest.customDateDesc", "Custom format"),
        },
        {
          tokens: ["@year", "@month", "@day"],
          description: t(
            "AddStampRequest.yearMonthDayDesc",
            "Individual date parts",
          ),
        },
      ],
    },
    {
      title: t("AddStampRequest.pageVars", "Page Information"),
      variables: [
        {
          tokens: ["@page_number"],
          description: t(
            "AddStampRequest.pageNumberDesc",
            "Current page number",
          ),
        },
        {
          tokens: ["@total_pages"],
          description: t(
            "AddStampRequest.totalPagesDesc",
            "Total number of pages",
          ),
        },
      ],
    },
    {
      title: t("AddStampRequest.fileVars", "File Information"),
      variables: [
        {
          tokens: ["@filename"],
          description: t(
            "AddStampRequest.filenameDesc",
            "Filename without extension",
          ),
        },
        {
          tokens: ["@filename_full"],
          description: t(
            "AddStampRequest.filenameFullDesc",
            "Filename with extension",
          ),
        },
      ],
    },
    {
      title: t("AddStampRequest.metadataVars", "Document Metadata"),
      variables: [
        {
          tokens: ["@author", "@title", "@subject"],
          description: t(
            "AddStampRequest.metadataDesc",
            "From PDF document properties",
          ),
        },
      ],
    },
    {
      title: t("AddStampRequest.otherVars", "Other"),
      variables: [
        {
          tokens: ["@uuid"],
          description: t(
            "AddStampRequest.uuidDesc",
            "Short unique identifier (8 chars)",
          ),
        },
      ],
    },
  ];
}

export function stampTextExamples(t: TFunction): StampTextExample[] {
  return [
    { text: "Page @page_number of @total_pages" },
    { text: "Created: @date{dd/MM/yyyy HH:mm}" },
    { text: "© @year @author" },
    {
      text: "@filename\\n@date",
      note: t("AddStampRequest.multiLine", "multi-line"),
    },
  ];
}
