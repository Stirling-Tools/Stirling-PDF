package stirling.software.proprietary.security.model;

/**
 * How much power an {@link ApiKey} carries when it authenticates - chosen by the creator.
 *
 * <ul>
 *   <li>{@code FULL} - acts as its owner with the owner's full authorities, including account and
 *       admin endpoints. A full-access key is the owner's own credential and must never be shared,
 *       so it is always PERSONAL (never team-scoped).
 *   <li>{@code PROCESSING} - restricted to the file/PDF processing endpoints; blocked from account,
 *       team, admin and portal management by {@code ApiKeyProcessingScopeInterceptor}. Safe to
 *       share regardless of the owner's role, so every team-scoped key is PROCESSING.
 * </ul>
 */
public enum ApiKeyAccess {
    FULL,
    PROCESSING;

    public boolean isProcessingOnly() {
        return this == PROCESSING;
    }
}
