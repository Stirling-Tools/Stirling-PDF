package stirling.software.proprietary.mcp;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.service.AuditService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Per-user rate limit, audit event and usage metrics around every MCP tool call. */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpCallObserver {

    static final String CALLS = "stirling.mcp.tool.calls";
    static final String DURATION = "stirling.mcp.tool.duration";

    private final ApplicationProperties applicationProperties;
    private final ObjectProvider<RateLimitStore> rateLimits;
    private final ObjectProvider<AuditService> audit;
    private final ObjectProvider<MeterRegistry> meters;

    public McpCallObserver(
            ApplicationProperties applicationProperties,
            ObjectProvider<RateLimitStore> rateLimits,
            ObjectProvider<AuditService> audit,
            ObjectProvider<MeterRegistry> meters) {
        this.applicationProperties = applicationProperties;
        this.rateLimits = rateLimits;
        this.audit = audit;
        this.meters = meters;
    }

    /** Seconds until the caller may call again, or 0 when the call is allowed. */
    public long secondsUntilAllowed(String user) {
        int perMinute = applicationProperties.getMcp().getRateLimitPerMinute();
        RateLimitStore store = rateLimits.getIfAvailable();
        if (perMinute <= 0 || store == null) {
            return 0;
        }
        String key = "mcp:user:" + (user == null ? "anonymous" : user);
        try {
            RateLimitDecision decision = store.tryConsume(key, perMinute, Duration.ofMinutes(1));
            return decision.allowed()
                    ? 0
                    : Math.max(1, TimeUnit.NANOSECONDS.toSeconds(decision.nanosToWaitForRefill()));
        } catch (RuntimeException e) {
            // A backplane outage must not take MCP down with it.
            log.warn("MCP rate limit check failed, allowing the call: {}", e.getMessage());
            return 0;
        }
    }

    /** Records one finished call; arguments are never logged as they may hold file bytes. */
    public void record(
            String user, String tool, JsonNode arguments, ObjectNode result, long nanos) {
        String outcome = outcome(result);
        String operation = operation(arguments);
        MeterRegistry registry = meters.getIfAvailable();
        if (registry != null) {
            Counter.builder(CALLS)
                    .tag("tool", tool)
                    .tag("outcome", outcome)
                    .register(registry)
                    .increment();
            Timer.builder(DURATION)
                    .tag("tool", tool)
                    .register(registry)
                    .record(nanos, TimeUnit.NANOSECONDS);
        }
        AuditService auditService = audit.getIfAvailable();
        if (auditService != null) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("tool", tool);
            if (operation != null) {
                data.put("operation", operation);
            }
            data.put("outcome", outcome);
            data.put("durationMs", TimeUnit.NANOSECONDS.toMillis(nanos));
            try {
                auditService.audit(
                        user == null ? "anonymous" : user, AuditEventType.MCP_TOOL_CALL, data);
            } catch (RuntimeException e) {
                log.warn("Could not audit MCP call to {}: {}", tool, e.getMessage());
            }
        }
    }

    static String outcome(ObjectNode result) {
        if (result == null) {
            return "error";
        }
        if ("input_required".equals(result.path("resultType").asText())) {
            return "input_required";
        }
        if (result.path("isError").asBoolean(false)) {
            return "error";
        }
        return "pending".equals(result.path("structuredContent").path("kind").asText())
                ? "pending"
                : "ok";
    }

    /** The catalog operation id, which is bounded; anything else is dropped. */
    private static String operation(JsonNode arguments) {
        JsonNode op = arguments == null ? null : arguments.get("operation");
        if (op == null || !op.isTextual()) {
            return null;
        }
        String id = op.asText();
        return id.length() <= 64 && id.matches("[a-z0-9-]+") ? id : null;
    }
}
