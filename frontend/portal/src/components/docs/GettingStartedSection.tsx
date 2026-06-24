import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@shared/components";
import type { CodeSample } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";
import { LangSnippet } from "@portal/components/docs/LangSnippet";

export function GettingStartedSection({
  samples,
  response,
}: {
  samples: CodeSample[];
  response: string;
}) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="quickstart"
      eyebrow={t("docs.quickstart.eyebrow")}
      title={t("docs.quickstart.title")}
      lead={t("docs.quickstart.lead")}
    >
      <ol className="portal-docs__steps">
        <li className="portal-docs__step">
          <span className="portal-docs__step-mark">1</span>
          <div className="portal-docs__step-body">
            <h3>{t("docs.quickstart.step1.title")}</h3>
            <p>{t("docs.quickstart.step1.body")}</p>
            <CodeBlock
              lang="bash"
              code={`export STIRLING_API_KEY="sk_live_8f2c...e10"`}
            />
          </div>
        </li>
        <li className="portal-docs__step">
          <span className="portal-docs__step-mark">2</span>
          <div className="portal-docs__step-body">
            <h3>{t("docs.quickstart.step2.title")}</h3>
            <p>{t("docs.quickstart.step2.body")}</p>
            <LangSnippet
              samples={samples}
              caption={t("docs.quickstart.step2.snippetCaption")}
            />
          </div>
        </li>
        <li className="portal-docs__step">
          <span className="portal-docs__step-mark">3</span>
          <div className="portal-docs__step-body">
            <h3>{t("docs.quickstart.step3.title")}</h3>
            <p>{t("docs.quickstart.step3.body")}</p>
            <CodeBlock
              lang="json"
              code={response}
              caption={t("docs.quickstart.step3.codeCaption")}
            />
          </div>
        </li>
      </ol>

      <Card className="portal-docs__callout" accent="blue" padding="loose">
        <strong>{t("docs.quickstart.callout.label")}</strong>{" "}
        {t("docs.quickstart.callout.bodyBeforeLink")}{" "}
        <em>{t("docs.quickstart.callout.link")}</em>{" "}
        {t("docs.quickstart.callout.bodyAfterLink")}
      </Card>
    </DocsSection>
  );
}
