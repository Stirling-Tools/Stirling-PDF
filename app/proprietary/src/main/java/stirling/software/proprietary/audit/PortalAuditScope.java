package stirling.software.proprietary.audit;

import java.util.List;

/**
 * Resolved visibility for a portal audit-log request.
 *
 * <ul>
 *   <li>{@code fullServer} - admin: every event on the instance.
 *   <li>{@code principals} non-empty - team leader: only events by these principals (member
 *       emails/usernames).
 *   <li>{@code !allowed} - caller may not view the audit log at all.
 * </ul>
 *
 * <p>{@code cacheKey} scopes the cached result (e.g. {@code "server"} or {@code "team:42"}).
 */
public record PortalAuditScope(
        boolean allowed, boolean fullServer, List<String> principals, String cacheKey) {

    public static PortalAuditScope denied() {
        return new PortalAuditScope(false, false, List.of(), "denied");
    }

    // Named server()/team() (not fullServer()) so they don't collide with the
    // auto-generated record accessors fullServer()/... .
    public static PortalAuditScope server() {
        return new PortalAuditScope(true, true, List.of(), "server");
    }

    public static PortalAuditScope team(String cacheKey, List<String> principals) {
        return new PortalAuditScope(true, false, List.copyOf(principals), cacheKey);
    }
}
