import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";
import {
  stampTextExamples,
  stampVariableGroups,
} from "@editor/components/tools/addStamp/stampVariables";

const code = (text: string) => `<code>${text}</code>`;

/** What stamp text prints and every @ variable it can hold, for the variable picker's help link. */
export const useStampVariableTips = (): SidebarTooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("AddStampRequest.stampText", "Stamp Text"),
    },
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
            "Type <code>\\n</code> to start a new line",
          ),
          t(
            "AddStampRequest.stampTextTips.literalAt",
            "Type <code>@@</code> for a literal @",
          ),
        ],
      },
      ...stampVariableGroups(t).map((group) => ({
        title: group.title,
        bullets: group.variables.map(
          (variable) =>
            `${variable.tokens.map(code).join(" ")} — ${variable.description}`,
        ),
      })),
      {
        title: t("AddStampRequest.examples", "Examples"),
        bullets: stampTextExamples(t).map((example) =>
          example.note
            ? `${code(example.text)} (${example.note})`
            : code(example.text),
        ),
      },
    ],
  };
};
