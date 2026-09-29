package stirling.software.proprietary.policy.overview;

import java.util.List;

/** The Pipelines overview payload: a KPI strip plus one row per policy. */
public record PoliciesOverviewResponse(List<PolicyKpi> kpis, List<PolicyView> pipelines) {}
