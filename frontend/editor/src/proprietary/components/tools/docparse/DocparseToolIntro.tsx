import { useTranslation } from "react-i18next";
import { Badge } from "@mantine/core";
import { useDocparseCapabilities } from "@app/hooks/useDocparseCapabilities";
import styles from "@app/components/tools/docparse/DocparseToolIntro.module.css";

interface DocparseToolIntroProps {
  /** 1-2 sentence "how this works" copy for the tool, already translated. */
  description: string;
  /**
   * Which AI badge fits the tool: "llm" tools always call the language model;
   * "layout" tools use the layout AI model only when advanced parsing is on.
   */
  aiBadge?: "llm" | "layout";
  /** Hide the scanned-docs fallback note where it cannot apply (DOCX input). */
  showFallbackNote?: boolean;
}

/** Compact "how this works" card at the top of every DocParse settings panel. */
const DocparseToolIntro = ({
  description,
  aiBadge,
  showFallbackNote = true,
}: DocparseToolIntroProps) => {
  const { t } = useTranslation();
  const { capabilities } = useDocparseCapabilities();
  const advanced = capabilities ? capabilities.advancedInstalled : null;

  return (
    <div className={styles.card}>
      <p className={styles.description}>{description}</p>
      <div className={styles.badges}>
        {aiBadge === "llm" && (
          <Badge size="sm" variant="light" color="grape">
            {t("docparse.intro.usesAi", "Uses AI")}
          </Badge>
        )}
        {aiBadge === "layout" && advanced === true && (
          <Badge size="sm" variant="light" color="grape">
            {t("docparse.intro.aiLayoutModel", "AI layout model")}
          </Badge>
        )}
        {advanced !== null && (
          <Badge size="sm" variant="light" color={advanced ? "teal" : "gray"}>
            {advanced
              ? t("docparse.intro.advancedOn", "Advanced parsing: on")
              : t("docparse.intro.advancedOff", "Advanced parsing: off")}
          </Badge>
        )}
      </div>
      {advanced === false && showFallbackNote && (
        <p className={styles.fallback}>
          {t(
            "docparse.intro.basicFallback",
            "Scanned documents fall back to basic text extraction - install the DocParse addon for layout AI",
          )}
        </p>
      )}
    </div>
  );
};

export default DocparseToolIntro;
