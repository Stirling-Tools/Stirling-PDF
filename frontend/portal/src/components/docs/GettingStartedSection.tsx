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
  return (
    <DocsSection
      id="quickstart"
      eyebrow="GETTING STARTED"
      title="Quickstart"
      lead="Send your first document to a typed endpoint and get structured JSON back in three steps. No model training, no prompt engineering."
    >
      <ol className="portal-docs__steps">
        <li className="portal-docs__step">
          <span className="portal-docs__step-mark">1</span>
          <div className="portal-docs__step-body">
            <h3>Issue an API key</h3>
            <p>
              Create a scoped key from the Infrastructure tab. Keys carry rate
              limits and an optional IP allowlist. Export it into your shell:
            </p>
            <CodeBlock
              lang="bash"
              code={`export STIRLING_API_KEY="sk_live_8f2c...e10"`}
            />
          </div>
        </li>
        <li className="portal-docs__step">
          <span className="portal-docs__step-mark">2</span>
          <div className="portal-docs__step-body">
            <h3>Send a document</h3>
            <p>
              POST a file to any typed endpoint. The endpoint determines the
              schema you get back — here, the invoice extractor.
            </p>
            <LangSnippet samples={samples} caption="extract an invoice" />
          </div>
        </li>
        <li className="portal-docs__step">
          <span className="portal-docs__step-mark">3</span>
          <div className="portal-docs__step-body">
            <h3>Read the structured result</h3>
            <p>
              Every response is validated against the endpoint schema, with a
              confidence score and per-field provenance.
            </p>
            <CodeBlock lang="json" code={response} caption="200 OK" />
          </div>
        </li>
      </ol>

      <Card className="portal-docs__callout" accent="blue" padding="loose">
        <strong>Next:</strong> wire the same call into a pipeline to chain
        validation, redaction, and delivery — or expose it to an agent over MCP.
        See <em>Playbooks</em> for copy-paste recipes.
      </Card>
    </DocsSection>
  );
}
