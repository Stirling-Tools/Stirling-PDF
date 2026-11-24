import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";
import {
  stampTextExamples,
  stampVariableGroups,
} from "@editor/components/tools/addStamp/stampVariables";

/** The Stamp Text field's sidebar help: what the text is, then every @ variable it can hold. */
export const useStampTextTips = (): SidebarTooltipContent => {
  const { t } = useTranslation();

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
      ...stampVariableGroups(t).map((group) => ({
        title: group.title,
        bullets: group.variables.map(
          (variable) =>
            `${variable.tokens.join(" ")} — ${variable.description}`,
        ),
      })),
      {
        title: t("AddStampRequest.examples", "Examples"),
        bullets: stampTextExamples(t).map((example) => example.label),
      },
    ],
  };
};
