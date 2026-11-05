package stirling.software.proprietary.mcp;

import java.security.SecureRandom;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PostHogService;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Emits PostHog MCP-analytics events ({@code $mcp_*}) so the PostHog MCP dashboard works for our
 * Java server. Never sends arguments, responses, free text or per-user identifiers.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpAnalytics {

    /** Request attribute the MCP auth filters set to {@code api_key} or {@code oauth}. */
    public static final String AUTH_METHOD_ATTRIBUTE = "stirling.mcp.authMethod";

    public static final String SESSION_HEADER = "Mcp-Session-Id";
    private static final String SESSION_ATTRIBUTE = "stirling.mcp.sessionId";
    private static final Pattern SESSION_ID = Pattern.compile("ses_[0-9a-f]{32}");
    private static final int MAX_SESSIONS = 10_000;

    private static final String SOURCE = "posthog_mcp_analytics";
    private static final String SERVER_NAME = "stirling-pdf-mcp";
    private static final Pattern SAFE_TOKEN =
            Pattern.compile("[A-Za-z0-9][A-Za-z0-9 ._/()-]{0,63}");

    private final ObjectProvider<PostHogService> postHog;
    private final ObjectProvider<McpToolCatalog> catalog;
    private final ApplicationProperties applicationProperties;
    // Usernames seen today per auth method, in memory only and sent as counts.
    // Per node and lost on restart, so multi-node totals overcount users seen on several nodes.
    private final Map<String, Set<String>> dailyUsers = new ConcurrentHashMap<>();
    // Client info per session so tool calls carry it; bounded LRU, best effort per node.
    private final Map<String, ClientInfo> sessionClients =
            Collections.synchronizedMap(
                    new LinkedHashMap<>(16, 0.75f, true) {
                        @Override
                        protected boolean removeEldestEntry(Map.Entry<String, ClientInfo> e) {
                            return size() > MAX_SESSIONS;
                        }
                    });
    private final SecureRandom random = new SecureRandom();

    private record ClientInfo(String name, String version) {}

    public McpAnalytics(
            ObjectProvider<PostHogService> postHog,
            ObjectProvider<McpToolCatalog> catalog,
            ApplicationProperties applicationProperties) {
        this.postHog = postHog;
        this.catalog = catalog;
        this.applicationProperties = applicationProperties;
    }

    // Checked per call since admins can toggle analytics at runtime.
    private boolean enabled() {
        return applicationProperties.getSystem().isPosthogEnabled();
    }

    /** Daily aggregate of distinct MCP users; no identifiers leave the server. */
    @Scheduled(cron = "0 0 0 * * *")
    public void flushDailyUsers() {
        if (!enabled()) {
            dailyUsers.clear();
            return;
        }
        Map<String, Integer> counts = new HashMap<>();
        Set<String> all = new HashSet<>();
        for (String method : List.copyOf(dailyUsers.keySet())) {
            Set<String> users = dailyUsers.remove(method);
            if (users != null && !users.isEmpty()) {
                counts.put(method, users.size());
                all.addAll(users);
            }
        }
        if (all.isEmpty()) {
            return;
        }
        Map<String, Object> props = new HashMap<>();
        props.put("$mcp_source", SOURCE);
        props.put("$process_person_profile", false);
        props.put("distinct_users", all.size());
        counts.forEach((method, count) -> props.put("distinct_users_" + method, count));
        capture("mcp_daily_users", props);
    }

    /** New session id for the initialize response, or null when analytics is off. */
    public String startSession() {
        if (!enabled()) {
            return null;
        }
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        String id = "ses_" + HexFormat.of().formatHex(bytes);
        HttpServletRequest request = currentRequest();
        if (request != null) {
            request.setAttribute(SESSION_ATTRIBUTE, id);
        }
        return id;
    }

    public void initialize(JsonNode params, String protocolVersion) {
        if (!enabled()) {
            return;
        }
        Map<String, Object> props = baseProperties();
        props.put("$mcp_protocol_version", protocolVersion);
        // Server identity once per session; other events carry app_version already.
        props.put("$mcp_server_name", SERVER_NAME);
        putSafe(
                props,
                "$mcp_server_version",
                applicationProperties.getAutomaticallyGenerated().getAppVersion());
        JsonNode clientInfo = params == null ? null : params.get("clientInfo");
        if (clientInfo != null) {
            ClientInfo client =
                    new ClientInfo(
                            safe(clientInfo.path("name").asText(null)),
                            safe(clientInfo.path("version").asText(null)));
            putClient(props, client);
            if (props.get("$session_id") instanceof String sessionId) {
                sessionClients.put(sessionId, client);
            }
        }
        capture("$mcp_initialize", props);
    }

    public void toolsList(List<String> toolNames) {
        if (!enabled()) {
            return;
        }
        Map<String, Object> props = baseProperties();
        props.put("$mcp_listed_tool_names", toolNames);
        capture("$mcp_tools_list", props);
    }

    /** Records one tools/call; pass the result, or the exception the tool threw. */
    public void toolCall(
            McpTool tool,
            JsonNode arguments,
            long durationMs,
            ObjectNode result,
            RuntimeException failure) {
        if (!enabled()) {
            return;
        }
        boolean toolError = result != null && result.path("isError").asBoolean(false);
        Map<String, Object> props = baseProperties();
        props.put("$mcp_tool_name", tool.name());
        if (tool.analyticsCategory() != null) {
            props.put("$mcp_tool_category", tool.analyticsCategory());
        }
        props.put("$mcp_duration_ms", durationMs);
        props.put("$mcp_is_error", failure != null || toolError);
        if (failure != null) {
            props.put("$mcp_error_type", "exception");
            props.put("$mcp_error_message", failure.getClass().getSimpleName());
        } else if (toolError) {
            // No message: tool error text can echo user input such as file ids.
            props.put("$mcp_error_type", "tool_error");
        }
        String operation = arguments == null ? null : arguments.path("operation").asText(null);
        if (isCatalogOperation(operation)) {
            props.put("stirling_operation", operation);
        }
        capture("$mcp_tool_call", props);
    }

    // Only catalog ids are sent, so free text typed as an operation never leaves the server.
    private boolean isCatalogOperation(String id) {
        McpToolCatalog c = id == null ? null : catalog.getIfAvailable();
        return c != null && c.findByOperationId(id).isPresent();
    }

    private Map<String, Object> baseProperties() {
        Map<String, Object> props = new HashMap<>();
        props.put("$mcp_source", SOURCE);
        props.put("$process_person_profile", false);
        HttpServletRequest request = currentRequest();
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        // Blank names (e.g. SaaS guests without an email) must not count as one shared user.
        boolean authenticated =
                auth != null
                        && auth.isAuthenticated()
                        && auth.getName() != null
                        && !auth.getName().isBlank();
        Object method = request == null ? null : request.getAttribute(AUTH_METHOD_ATTRIBUTE);
        props.put("stirling_auth_method", authMethod(method, authenticated));
        if (authenticated) {
            dailyUsers
                    .computeIfAbsent(authMethod(method, true), k -> ConcurrentHashMap.newKeySet())
                    .add(auth.getName().toLowerCase(Locale.ROOT));
        }
        if (request != null) {
            String sessionId = sessionId(request);
            if (sessionId != null) {
                props.put("$session_id", sessionId);
                ClientInfo client = sessionClients.get(sessionId);
                if (client != null) {
                    putClient(props, client);
                }
            }
        }
        return props;
    }

    private void capture(String event, Map<String, Object> props) {
        PostHogService service = postHog.getIfAvailable();
        if (service == null) {
            return;
        }
        try {
            service.captureEvent(event, props);
        } catch (RuntimeException e) {
            log.debug("Failed to capture MCP analytics event {}", event, e);
        }
    }

    private static String authMethod(Object method, boolean authenticated) {
        if (method instanceof String m) {
            return m;
        }
        return authenticated ? "other" : "none";
    }

    private static void putSafe(Map<String, Object> props, String key, String value) {
        if (safe(value) != null) {
            props.put(key, value);
        }
    }

    private static String safe(String value) {
        return value != null && SAFE_TOKEN.matcher(value).matches() ? value : null;
    }

    private static void putClient(Map<String, Object> props, ClientInfo client) {
        if (client.name() != null) {
            props.put("$mcp_client_name", client.name());
        }
        if (client.version() != null) {
            props.put("$mcp_client_version", client.version());
        }
    }

    // Format-checked only so ids issued by another node still work; a forged id only
    // relabels the caller's own events.
    private static String sessionId(HttpServletRequest request) {
        if (request.getAttribute(SESSION_ATTRIBUTE) instanceof String issued) {
            return issued;
        }
        String header = request.getHeader(SESSION_HEADER);
        return header != null && SESSION_ID.matcher(header).matches() ? header : null;
    }

    private static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes a
                ? a.getRequest()
                : null;
    }
}
