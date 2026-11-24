import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";
import {
  stampTextExamples,
  stampVariableGroups,
} from "@editor/components/tools/addStamp/stampVariables";

const code = (text: string) => `<code>${text}</code>`;

/** What every stamp @ variable fills in, for the variable picker's help link. */
export const useStampVariableTips = (): SidebarTooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("AddStampRequest.variableTips.title", "Stamp variables"),
    },
    tips: [
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
