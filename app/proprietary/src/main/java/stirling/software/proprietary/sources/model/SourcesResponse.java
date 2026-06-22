package stirling.software.proprietary.sources.model;

import java.util.List;

/**
 * Payload for {@code GET /api/v1/sources}: the KPI strip plus the rows for the portal's Sources
 * overview. Shape mirrors the portal's {@code SourcesResponse} TypeScript type.
 */
public record SourcesResponse(List<SourcesKpi> kpis, List<SourceView> sources) {}
