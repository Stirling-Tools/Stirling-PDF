package stirling.software.proprietary.policy.output;

import java.util.List;

/** The Outputs overview payload: a KPI strip plus one row per output. */
public record OutputsResponse(List<OutputKpi> kpis, List<OutputView> outputs) {}
