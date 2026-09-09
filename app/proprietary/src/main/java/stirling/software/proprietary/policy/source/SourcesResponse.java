package stirling.software.proprietary.policy.source;

import java.util.List;

/** The Sources overview payload: a KPI strip plus one row per source. */
public record SourcesResponse(List<SourceKpi> kpis, List<SourceView> sources) {}
