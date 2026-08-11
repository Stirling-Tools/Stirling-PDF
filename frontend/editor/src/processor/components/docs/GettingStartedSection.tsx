import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@app/ui";
import type { CodeSample } from "@processor/api/docs";
import { DocsSection } from "@processor/components/docs/DocsSection";
import { LangSnippet } from "@processor/components/docs/LangSnippet";

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
      eyebrow={t("processor.docs.quickstart.eyebrow")}
      title={t("processor.docs.quickstart.title")}
      lead={t("processor.docs.quickstart.lead")}
    >
      <ol className="processor-docs__steps">
        <li className="processor-docs__step">
          <span className="processor-docs__step-mark">1</span>
          <div className="processor-docs__step-body">
            <h3>{t("processor.docs.quickstart.step1.title")}</h3>
            <p>{t("processor.docs.quickstart.step1.body")}</p>
            <CodeBlock
              lang="bash"
              code={`export STIRLING_API_KEY="sk_live_8f2c...e10"`}
            />
          </div>
        </li>
        <li className="processor-docs__step">
          <span className="processor-docs__step-mark">2</span>
          <div className="processor-docs__step-body">
            <h3>{t("processor.docs.quickstart.step2.title")}</h3>
            <p>{t("processor.docs.quickstart.step2.body")}</p>
            <LangSnippet
              samples={samples}
              caption={t("processor.docs.quickstart.step2.snippetCaption")}
            />
          </div>
        </li>
        <li className="processor-docs__step">
          <span className="processor-docs__step-mark">3</span>
          <div className="processor-docs__step-body">
            <h3>{t("processor.docs.quickstart.step3.title")}</h3>
            <p>{t("processor.docs.quickstart.step3.body")}</p>
            <CodeBlock
              lang="json"
              code={response}
              caption={t("processor.docs.quickstart.step3.codeCaption")}
            />
          </div>
        </li>
      </ol>

      <Card
        className="processor-docs__callout"
        accent="default"
        padding="loose"
      >
        <strong>{t("processor.docs.quickstart.callout.label")}</strong>{" "}
        {t("processor.docs.quickstart.callout.bodyBeforeLink")}{" "}
        <em>{t("processor.docs.quickstart.callout.link")}</em>{" "}
        {t("processor.docs.quickstart.callout.bodyAfterLink")}
      </Card>
    </DocsSection>
  );
}
