/**
 * Portal lens on the shared setup wizard: supplies the portal-only seams, the integrations
 * lookup that gates Purview steps, the Purview inline config and the portal's error copy.
 */

import { PolicySetupWizard as SharedPolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import type { CatalogueEntry, PolicySetupResult } from "@portal/api/policies";
import { fetchIntegrations } from "@portal/api/integrations";
import { errorMessage } from "@portal/api/http";
import { useAsync } from "@portal/hooks/useAsync";
import { useMemo } from "react";
import { PolicyPurviewConfig } from "@portal/components/policies/PolicyPurviewConfig";

interface PolicySetupWizardProps {
  entry: CatalogueEntry | null;
  /** Whether the user may edit pipelines and policies (a manager); when false the wizard is read-only. */
  canManagePolicies?: boolean;
  /**
   * The permission check is still loading. The enforce toggle stays locked, but the manager-only
   * tooltip is withheld so a still-loading manager isn't told they lack permission.
   */
  permissionsLoading?: boolean;
  onClose: () => void;
  onSubmit: (entry: CatalogueEntry, result: PolicySetupResult) => Promise<void>;
  onCustomise: (entry: CatalogueEntry, result: PolicySetupResult) => void;
}

export function PolicySetupWizard(props: PolicySetupWizardProps) {
  const integrationsAsync = useAsync(() => fetchIntegrations(), []);
  const hasPurviewConnection = useMemo(
    () =>
      (integrationsAsync.data ?? []).some(
        (c) => c.integrationType === "PURVIEW",
      ),
    [integrationsAsync.data],
  );
  return (
    <SharedPolicySetupWizard
      {...props}
      hasPurviewConnection={hasPurviewConnection}
      formatError={errorMessage}
      purviewConfig={({ parameters, onChange }) => (
        <PolicyPurviewConfig parameters={parameters} onChange={onChange} />
      )}
    />
  );
}
