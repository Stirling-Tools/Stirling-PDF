package stirling.software.proprietary.audit;

import java.util.List;

/** Resolved audit visibility: fullServer (admin), principals-scoped (team lead), or !allowed. */
public record ProcessorAuditScope(
        boolean allowed, boolean fullServer, List<String> principals, String cacheKey) {

    public static ProcessorAuditScope denied() {
        return new ProcessorAuditScope(false, false, List.of(), "denied");
    }

    // Named server()/team() to avoid colliding with the record's fullServer() accessor.
    public static ProcessorAuditScope server() {
        return new ProcessorAuditScope(true, true, List.of(), "server");
    }

    public static ProcessorAuditScope team(String cacheKey, List<String> principals) {
        return new ProcessorAuditScope(true, false, List.copyOf(principals), cacheKey);
    }
}
