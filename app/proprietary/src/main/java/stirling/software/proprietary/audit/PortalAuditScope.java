package stirling.software.proprietary.audit;

import java.util.List;

/** Resolved audit visibility: fullServer (admin), principals-scoped (team lead), or !allowed. */
public record PortalAuditScope(
        boolean allowed, boolean fullServer, List<String> principals, String cacheKey) {

    public static PortalAuditScope denied() {
        return new PortalAuditScope(false, false, List.of(), "denied");
    }

    // Named server()/team() to avoid colliding with the record's fullServer() accessor.
    public static PortalAuditScope server() {
        return new PortalAuditScope(true, true, List.of(), "server");
    }

    public static PortalAuditScope team(String cacheKey, List<String> principals) {
        return new PortalAuditScope(true, false, List.copyOf(principals), cacheKey);
    }
}
