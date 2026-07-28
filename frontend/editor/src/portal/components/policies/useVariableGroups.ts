import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { fetchIntegrations } from "@portal/api/integrations";
import { usePoliciesList } from "@portal/queries/policies";
import { fromWirePolicy } from "@app/policies/codec";
import {
  variableGroupsFor,
  type VariableGroup,
} from "@portal/components/policies/variables";

/**
 * The variable groups this team can actually use.
 *
 * Classification variables only resolve where a classification policy is enabled, and
 * sensitivity-label ones only where Purview is connected - so those groups are offered only when
 * the team's data says they exist. Fail-open: until (or unless) the answers arrive, everything is
 * offered, because hiding a variable from a team that uses it is the worse mistake.
 *
 * `stepPosition` is the configured step's 1-based place in its chain; with it known, the steps
 * group offers only the steps that actually ran before this one (see variableGroupsFor).
 */
export function useVariableGroups(stepPosition?: number): VariableGroup[] {
  const integrations = useQuery({
    queryKey: qk.integrations(),
    queryFn: fetchIntegrations,
  });
  const policies = usePoliciesList();

  return useMemo(() => {
    const availability =
      !integrations.data || !policies.data
        ? undefined
        : {
            sensitivityLabel: integrations.data.some(
              (connection) => connection.integrationType === "PURVIEW",
            ),
            classification: policies.data.some((wire) => {
              try {
                return (
                  wire.enabled &&
                  fromWirePolicy(wire).categoryId === "classification"
                );
              } catch {
                // One malformed stored policy must not decide the menu.
                return false;
              }
            }),
          };
    return variableGroupsFor(availability, stepPosition);
  }, [integrations.data, policies.data, stepPosition]);
}
