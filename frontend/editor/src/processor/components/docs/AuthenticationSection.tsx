import { useTranslation } from "react-i18next";
import { Chip, CodeBlock } from "@app/ui";
import { DocsSection } from "@processor/components/docs/DocsSection";

export function AuthenticationSection() {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="authentication"
      eyebrow={t("processor.docs.authentication.eyebrow")}
      title={t("processor.docs.authentication.title")}
      lead={t("processor.docs.authentication.lead")}
    >
      <CodeBlock
        lang="http"
        caption={t("processor.docs.authentication.codeCaption")}
        code={`Authorization: Bearer sk_live_8f2c...e10`}
      />
      <div className="processor-docs__keytable">
        <div className="processor-docs__keyrow">
          <Chip accent="success" size="sm" showDot>
            sk_live_
          </Chip>
          <span>{t("processor.docs.authentication.liveKey")}</span>
        </div>
        <div className="processor-docs__keyrow">
          <Chip accent="warning" size="sm" showDot>
            sk_test_
          </Chip>
          <span>{t("processor.docs.authentication.testKey")}</span>
        </div>
      </div>
    </DocsSection>
  );
}
