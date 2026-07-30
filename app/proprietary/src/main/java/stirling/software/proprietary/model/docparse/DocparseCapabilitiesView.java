package stirling.software.proprietary.model.docparse;

/** Merged capability view served by {@code GET /api/v1/docparse/capabilities} (Java side). */
public record DocparseCapabilitiesView(
        boolean enabled,
        String mode,
        boolean advancedInstalled,
        boolean engineReachable,
        String doclingVersion) {}
