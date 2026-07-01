import { useTranslation } from "react-i18next";
import { Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchEditorDeployment,
  type EditorDeploymentResponse,
} from "@portal/api/editorDeploy";
import { DeploymentSummaryStrip } from "@portal/components/editor-admin/DeploymentSummaryStrip";
import { DeploymentTargets } from "@portal/components/editor-admin/DeploymentTargets";
import { PairingPanel } from "@portal/components/editor-admin/PairingPanel";
import { InstanceHealthTable } from "@portal/components/editor-admin/InstanceHealthTable";
import { CredentialRotationCard } from "@portal/components/editor-admin/CredentialRotationCard";
import { OfflineActivationCard } from "@portal/components/editor-admin/OfflineActivationCard";
import "@portal/views/EditorAdmin.css";

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
          <h1 className="portal-editor__title">{t("editorAdmin.title")}</h1>
          <p className="portal-editor__sub">{t("editorAdmin.subtitle")}</p>
        </div>
      </header>

      <DeploymentSummaryStrip summary={data?.summary} loading={isLoading} />

      <section>
        <SectionHead
          title={t("editorAdmin.sections.targets.title")}
          sub={t("editorAdmin.sections.targets.sub")}
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
          title={t("editorAdmin.sections.pairing.title")}
          sub={t("editorAdmin.sections.pairing.sub")}
        />
        {data && (
          <PairingPanel pairings={data.pairings} onUpgrade={goUpgrade} />
        )}
      </section>

      <section>
        <SectionHead
          title={t("editorAdmin.sections.health.title")}
          sub={t("editorAdmin.sections.health.sub")}
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
