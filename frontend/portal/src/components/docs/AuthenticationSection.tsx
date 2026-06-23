import { Chip, CodeBlock } from "@shared/components";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function AuthenticationSection() {
  return (
    <DocsSection
      id="authentication"
      eyebrow="GETTING STARTED"
      title="Authentication"
      lead="All requests authenticate with a bearer token. Keys are scoped per environment and never expire unless rotated."
    >
      <CodeBlock
        lang="http"
        caption="every request"
        code={`Authorization: Bearer sk_live_8f2c...e10`}
      />
      <div className="portal-docs__keytable">
        <div className="portal-docs__keyrow">
          <Chip accent="green" size="sm" showDot>
            sk_live_
          </Chip>
          <span>Production keys — billed, rate-limited per your plan.</span>
        </div>
        <div className="portal-docs__keyrow">
          <Chip accent="amber" size="sm" showDot>
            sk_test_
          </Chip>
          <span>Sandbox keys — free, return synthetic fixtures.</span>
        </div>
      </div>
    </DocsSection>
  );
}
