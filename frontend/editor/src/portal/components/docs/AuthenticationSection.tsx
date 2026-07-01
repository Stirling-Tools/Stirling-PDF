import { useTranslation } from "react-i18next";
import { Chip, CodeBlock } from "@app/ui";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function AuthenticationSection() {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="authentication"
      eyebrow={t("portal.docs.authentication.eyebrow")}
      title={t("portal.docs.authentication.title")}
      lead={t("portal.docs.authentication.lead")}
    >
      <CodeBlock
        lang="http"
        caption={t("portal.docs.authentication.codeCaption")}
        code={`Authorization: Bearer sk_live_8f2c...e10`}
      />
      <div className="portal-docs__keytable">
        <div className="portal-docs__keyrow">
          <Chip tone="green" size="sm" showDot>
            sk_live_
          </Chip>
          <span>{t("portal.docs.authentication.liveKey")}</span>
        </div>
        <div className="portal-docs__keyrow">
          <Chip tone="amber" size="sm" showDot>
            sk_test_
          </Chip>
          <span>{t("portal.docs.authentication.testKey")}</span>
        </div>
      </div>
    </DocsSection>
  );
}
