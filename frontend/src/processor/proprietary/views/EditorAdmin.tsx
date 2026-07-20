import { useTranslation } from "react-i18next";
import { Skeleton } from "@editor/ui";
import { useTier } from "@processor/contexts/TierContext";
import { useView } from "@processor/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@processor/hooks/useAsync";
import {
  fetchEditorDeployment,
  type EditorDeploymentResponse,
} from "@processor/api/editorDeploy";
import { DeploymentSummaryStrip } from "@processor/components/editor-admin/DeploymentSummaryStrip";
import { DeploymentTargets } from "@processor/components/editor-admin/DeploymentTargets";
import { PairingPanel } from "@processor/components/editor-admin/PairingPanel";
import { InstanceHealthTable } from "@processor/components/editor-admin/InstanceHealthTable";
import { CredentialRotationCard } from "@processor/components/editor-admin/CredentialRotationCard";
import { OfflineActivationCard } from "@processor/components/editor-admin/OfflineActivationCard";
import "@processor/views/EditorAdmin.css";

/** Title + sub-line for a section block on this page. */
function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="portal-editor__section-head">
      <h2 className="portal-editor__section-title">{title}</h2>
      <p className="portal-editor__section-sub">{sub}</p>
    </header>
  );
}

/**
 * Editor deployment management. Deploy the Stirling PDF Editor product to a
 * target (Managed Cloud / Docker / Kubernetes), pair self-hosted instances back
 * to the org, watch instance health, and run credential / offline-activation
 * lifecycle tasks. Reached from Infrastructure → Deployments, not the sidebar.
 */
export function EditorAdmin() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const state = useAsync<EditorDeploymentResponse>(
    () => fetchEditorDeployment(tier),
    [tier],
  );
  const { data } = state;
  const { isLoading } = useSectionFlags(state);

  // Lower tiers nudge toward Usage & Billing to upgrade; the snippet shows the
  // value of the higher tier inline before the user gets there.
  const goUpgrade = () => setActiveView("usage");

  return (
    <div className="portal-editor">
      <header className="portal-editor__head">
        <div>
          <h1 className="portal-editor__title">
            {t("portal.editorAdmin.title")}
          </h1>
          <p className="portal-editor__sub">
            {t("portal.editorAdmin.subtitle")}
          </p>
        </div>
      </header>

      <DeploymentSummaryStrip summary={data?.summary} loading={isLoading} />

      <section>
        <SectionHead
          title={t("portal.editorAdmin.sections.targets.title")}
          sub={t("portal.editorAdmin.sections.targets.sub")}
        />
        {isLoading || !data ? (
          <div className="portal-editor__targets">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height="14rem" />
            ))}
          </div>
        ) : (
          <DeploymentTargets targets={data.targets} onUpgrade={goUpgrade} />
        )}
      </section>

      <section>
        <SectionHead
          title={t("portal.editorAdmin.sections.pairing.title")}
          sub={t("portal.editorAdmin.sections.pairing.sub")}
        />
        {data && (
          <PairingPanel pairings={data.pairings} onUpgrade={goUpgrade} />
        )}
      </section>

      <section>
        <SectionHead
          title={t("portal.editorAdmin.sections.health.title")}
          sub={t("portal.editorAdmin.sections.health.sub")}
        />
        {data && <InstanceHealthTable instances={data.instances} />}
      </section>

      <section className="portal-editor__ops">
        {data && (
          <CredentialRotationCard serviceToken={data.summary.serviceToken} />
        )}
        {data && (
          <OfflineActivationCard
            available={data.summary.offlineActivationAvailable}
            onUpgrade={goUpgrade}
          />
        )}
      </section>
    </div>
  );
}
