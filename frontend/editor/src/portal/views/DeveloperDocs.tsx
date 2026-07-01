import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchDocsContent,
  fetchDocsNav,
  type DocsContent,
  type DocsNavSection,
} from "@portal/api/docs";
import { DocsNav, DocsNavSkeleton } from "@portal/components/docs/DocsNav";
import { GettingStartedSection } from "@portal/components/docs/GettingStartedSection";
import { AuthenticationSection } from "@portal/components/docs/AuthenticationSection";
import { RateLimitsSection } from "@portal/components/docs/RateLimitsSection";
import { EndpointReferenceSection } from "@portal/components/docs/EndpointReferenceSection";
import { ErrorsSection } from "@portal/components/docs/ErrorsSection";
import { WebhooksSection } from "@portal/components/docs/WebhooksSection";
import { SdksSection } from "@portal/components/docs/SdksSection";
import { ComponentsSection } from "@portal/components/docs/ComponentsSection";
import { PlaybooksSection } from "@portal/components/docs/PlaybooksSection";
import { SkillsSection } from "@portal/components/docs/SkillsSection";
import "@portal/views/DeveloperDocs.css";

/** Renders the content pane for the active nav leaf against fetched content. */
function DocsContentPane({
  active,
  content,
}: {
  active: string;
  content: DocsContent;
}) {
  switch (active) {
    case "authentication":
      return <AuthenticationSection />;
    case "rate-limits":
      return <RateLimitsSection rateLimit={content.rateLimit} />;
    case "endpoints":
      return <EndpointReferenceSection />;
    case "errors":
      return <ErrorsSection errors={content.errors} />;
    case "webhooks":
      return <WebhooksSection />;
    case "sdk-overview":
      return <SdksSection sdks={content.sdks} />;
    case "component-library":
      return <ComponentsSection components={content.components} />;
    case "recipes":
      return <PlaybooksSection playbooks={content.playbooks} />;
    case "skill-catalog":
      return <SkillsSection skills={content.skills} />;
    default:
      return (
        <GettingStartedSection
          samples={content.quickstartSamples}
          response={content.quickstartResponse}
        />
      );
  }
}

export function DeveloperDocs() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [active, setActive] = useState("quickstart");

  const navState = useAsync<DocsNavSection[]>(() => fetchDocsNav(), []);
  const { data: nav } = navState;
  const { isLoading, isEmpty } = useSectionFlags(navState);

  const { data: content } = useAsync<DocsContent>(
    () => fetchDocsContent(tier),
    [tier],
  );

  return (
    <div className="portal-docs">
      <aside className="portal-docs__sidebar">
        {isLoading && <DocsNavSkeleton />}
        {isEmpty && (
          <EmptyState
            size="compact"
            title={t("docs.nav.empty.title")}
            description={t("docs.nav.empty.description")}
          />
        )}
        {nav && nav.length > 0 && (
          <DocsNav sections={nav} active={active} onSelect={setActive} />
        )}
      </aside>

      <main className="portal-docs__content">
        {content && <DocsContentPane active={active} content={content} />}
      </main>
    </div>
  );
}
