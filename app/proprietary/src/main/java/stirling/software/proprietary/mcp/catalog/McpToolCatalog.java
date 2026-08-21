package stirling.software.proprietary.mcp.catalog;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import io.swagger.v3.oas.annotations.Operation;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Discovers MCP-exposable operations and caches a per-op {@link OperationMeta}. Refreshed on {@link
 * ContextRefreshedEvent} and filtered on read by {@link
 * EndpointConfiguration#isEndpointEnabledForUri}. AI capabilities are fed in via {@link
 * #replaceAiCapabilities}.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpToolCatalog {

    private static final String WRITE_SCOPE = "mcp.tools.write";

    private final ApplicationContext applicationContext;
    private final EndpointConfiguration endpointConfiguration;
    private final ApplicationProperties applicationProperties;
    private final SimpleSchemaGenerator schemaGenerator;
    private final ObjectMapper objectMapper;

    // Concurrent: written on the boot thread, read on request threads, AI map replaced at runtime.
    private final Map<String, OperationMeta> pdfOps = new ConcurrentHashMap<>();

    // Engine-driven AI capabilities. Replaced wholesale by the scheduled refresh task on a
    // background thread while request threads read via findByOperationId/enabledOps. The volatile
    // reference makes the swap publication-safe; readers either see the old or the new snapshot,
    // never a partially-merged one.
    private volatile Map<String, OperationMeta> aiOps = new ConcurrentHashMap<>();

    public McpToolCatalog(
            ApplicationContext applicationContext,
            EndpointConfiguration endpointConfiguration,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper) {
        this.applicationContext = applicationContext;
        this.endpointConfiguration = endpointConfiguration;
        this.applicationProperties = applicationProperties;
        this.schemaGenerator = new SimpleSchemaGenerator(objectMapper);
        this.objectMapper = objectMapper;
    }

    /** Admin tool filter: non-empty allow list is a whitelist; block list always removes. */
    private boolean isOperationAllowed(String id) {
        ApplicationProperties.Mcp mcp = applicationProperties.getMcp();
        List<String> allowed = mcp.getAllowedOperations();
        List<String> blocked = mcp.getBlockedOperations();
        if (blocked != null && blocked.contains(id)) {
            return false;
        }
        if (allowed != null && !allowed.isEmpty()) {
            return allowed.contains(id);
        }
        return true;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void discover() {
        pdfOps.clear();
        for (RequestMappingHandlerMapping mapping :
                applicationContext.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            for (Map.Entry<RequestMappingInfo, HandlerMethod> e :
                    mapping.getHandlerMethods().entrySet()) {
                indexOne(e.getKey(), e.getValue());
            }
        }
        log.info("MCP tool catalog discovered {} PDF operation(s)", pdfOps.size());
    }

    private void indexOne(RequestMappingInfo info, HandlerMethod handler) {
        Set<String> patterns = extractPatterns(info);
        if (patterns.isEmpty()) {
            return;
        }
        Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
        if (!isInvocableMethod(methods)) {
            return;
        }
        for (String pattern : patterns) {
            OperationCategory category = OperationCategory.fromUrl(pattern);
            if (category == null) {
                continue;
            }
            String opId = extractOpId(pattern, category);
            if (opId == null) {
                continue;
            }
            OperationMeta meta = buildMeta(opId, category, pattern, handler);
            // First handler wins on duplicate URLs.
            pdfOps.putIfAbsent(opId, meta);
        }
    }

    private OperationMeta buildMeta(
            String opId, OperationCategory category, String url, HandlerMethod handler) {
        Method method = handler.getMethod();
        Operation opAnno = method.getAnnotation(Operation.class);
        String summary =
                opAnno != null && !opAnno.summary().isBlank()
                        ? opAnno.summary()
                        : prettifyOpId(opId);
        ObjectNode schema = paramSchemaFor(handler);
        // Every mutating endpoint requires the write scope.
        return new OperationMeta(
                opId,
                category,
                summary,
                schema,
                WRITE_SCOPE,
                OperationMeta.Target.JAVA_ENDPOINT,
                url,
                handler);
    }

    private ObjectNode paramSchemaFor(HandlerMethod handler) {
        Optional<Class<?>> bodyType = firstComplexParamType(handler);
        return bodyType.map(schemaGenerator::toSchema).orElseGet(() -> emptyObjectSchema());
    }

    private ObjectNode emptyObjectSchema() {
        ObjectNode out = objectMapper.createObjectNode();
        out.put("type", "object");
        out.put("additionalProperties", true);
        return out;
    }

    private Optional<Class<?>> firstComplexParamType(HandlerMethod handler) {
        for (MethodParameter p : handler.getMethodParameters()) {
            Class<?> type = p.getParameterType();
            if (type.isPrimitive() || type == String.class || type.getName().startsWith("java.")) {
                continue;
            }
            // Skip Spring-managed parameter types (HttpServletRequest, Principal, etc.).
            String pkg = type.getPackageName();
            if (pkg.startsWith("jakarta.") || pkg.startsWith("org.springframework.")) {
                continue;
            }
            return Optional.of(type);
        }
        return Optional.empty();
    }

    public List<OperationMeta> enabledOps(OperationCategory category) {
        if (category == OperationCategory.AI) {
            List<OperationMeta> ai = new ArrayList<>();
            for (OperationMeta m : aiOps.values()) {
                if (isOperationAllowed(m.id())) {
                    ai.add(m);
                }
            }
            return ai;
        }
        List<OperationMeta> out = new ArrayList<>();
        for (OperationMeta m : pdfOps.values()) {
            if (m.category() == category
                    && isOperationAllowed(m.id())
                    && endpointConfiguration.isEndpointEnabledForUri(m.endpointPath())) {
                out.add(m);
            }
        }
        out.sort((a, b) -> a.id().compareTo(b.id()));
        return out;
    }

    public Optional<OperationMeta> findByOperationId(String id) {
        if (!isOperationAllowed(id)) {
            return Optional.empty();
        }
        // A disabled PDF op returns empty rather than falling through to a same-id AI capability.
        OperationMeta meta = pdfOps.get(id);
        if (meta != null) {
            boolean enabled =
                    meta.target() != OperationMeta.Target.JAVA_ENDPOINT
                            || endpointConfiguration.isEndpointEnabledForUri(meta.endpointPath());
            return enabled ? Optional.of(meta) : Optional.empty();
        }
        return Optional.ofNullable(aiOps.get(id));
    }

    /** Replace the AI capabilities snapshot. Called by the engine refresh task. */
    public void replaceAiCapabilities(Map<String, OperationMeta> updated) {
        // Build a fresh map then swap atomically via the volatile reference. The previous
        // implementation did putAll-then-retainAll on a shared ConcurrentHashMap, which left a
        // transient window where readers could observe stale entries that should have been
        // removed (race between the two structural updates).
        Map<String, OperationMeta> next = new ConcurrentHashMap<>(updated);
        this.aiOps = next;
        log.info("MCP tool catalog AI capabilities replaced: {} entries", next.size());
    }

    /** Only POST/PUT endpoints are exposed as tools; DELETE and GET are excluded. */
    static boolean isInvocableMethod(Set<RequestMethod> methods) {
        return methods.contains(RequestMethod.POST) || methods.contains(RequestMethod.PUT);
    }

    private static String extractOpId(String pattern, OperationCategory category) {
        if (category.urlPrefix() == null || !pattern.startsWith(category.urlPrefix())) {
            return null;
        }
        String tail = pattern.substring(category.urlPrefix().length());
        if (tail.isBlank() || tail.contains("/") || tail.contains("{")) {
            // Skip nested paths and path-variable templates.
            return null;
        }
        return tail;
    }

    private static String prettifyOpId(String id) {
        return id.replace('-', ' ');
    }

    private static Set<String> extractPatterns(RequestMappingInfo info) {
        try {
            Method getDirectPaths = info.getClass().getMethod("getDirectPaths");
            Object result = getDirectPaths.invoke(info);
            if (result instanceof Set<?> set) {
                Set<String> patterns = new TreeSet<>();
                for (Object v : set) {
                    if (v instanceof String s) {
                        patterns.add(s);
                    }
                }
                return patterns;
            }
        } catch (Exception e) {
            log.trace("getDirectPaths unavailable on RequestMappingInfo", e);
        }
        return Collections.emptySet();
    }

    public Map<String, OperationMeta> snapshotPdfOps() {
        return new LinkedHashMap<>(pdfOps);
    }
}
