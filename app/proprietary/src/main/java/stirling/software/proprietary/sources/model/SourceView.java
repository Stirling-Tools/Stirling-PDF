package stirling.software.proprietary.sources.model;

/**
 * One row in the Sources overview table. Shape mirrors the portal's {@code Source} TypeScript type.
 * {@code lastEvent} is a humanised relative-time string ("4m ago") computed at request time.
 */
public record SourceView(
        String id,
        String name,
        String type,
        String status,
        long docs24h,
        long docs30d,
        String lastEvent,
        String owner,
        SourceDetailView detail) {}
