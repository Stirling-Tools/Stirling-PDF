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

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
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
 * EndpointConfiguration#isEndpointEnabledForUri}. AI tools are the Java {@code /api/v1/ai/tools/*}
 * endpoints, so they bill and authorize like any other call.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpToolCatalog {

    private static final String WRITE_SCOPE = "mcp.tools.write";
    // Endpoints outside the category prefixes that chat apps should still have.
    private static final Map<String, String> EXTRA_OPS =
            Map.of(
                    "/api/v1/form/fill", "fill-form",
                    "/api/v1/form/fields", "list-form-fields");

    private final ApplicationContext applicationContext;
    private final EndpointConfiguration endpointConfiguration;
    private final ApplicationProperties applicationProperties;
    private final SimpleSchemaGenerator schemaGenerator;
    private final ObjectMapper objectMapper;
    private final McpSchemaAdjuster adjuster;

    // Concurrent: written on the boot thread, read on request threads.
    private final Map<String, OperationMeta> pdfOps = new ConcurrentHashMap<>();

    public McpToolCatalog(
            ApplicationContext applicationContext,
            EndpointConfiguration endpointConfiguration,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper) {
        this(applicationContext, endpointConfiguration, applicationProperties, objectMapper, null);
    }

    @Autowired
    public McpToolCatalog(
            ApplicationContext applicationContext,
            EndpointConfiguration endpointConfiguration,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper,
            ObjectProvider<McpSchemaAdjuster> adjuster) {
        this.applicationContext = applicationContext;
        this.endpointConfiguration = endpointConfiguration;
        this.applicationProperties = applicationProperties;
        this.schemaGenerator = new SimpleSchemaGenerator(objectMapper);
        this.objectMapper = objectMapper;
        this.adjuster = adjuster == null ? null : adjuster.getIfAvailable();
    }

    /** The operation fitted to this server, e.g. without signing options it can't use. */
    private OperationMeta fitted(OperationMeta meta) {
        return adjuster == null ? meta : adjuster.adjust(meta);
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
            String extra = EXTRA_OPS.get(pattern);
            if (extra != null) {
                pdfOps.putIfAbsent(
                        extra, buildMeta(extra, OperationCategory.MISC, pattern, handler));
                continue;
            }
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
        if (bodyType.isPresent()) {
            return schemaGenerator.toSchema(bodyType.get());
        }
        ObjectNode fromParams = schemaGenerator.forRequestParams(handler.getMethod());
        return fromParams != null ? fromParams : emptyObjectSchema();
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
            if (type.isPrimitive()
                    || type.isArray()
                    || type == String.class
                    || type.getName().startsWith("java.")) {
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
        List<OperationMeta> out = new ArrayList<>();
        for (OperationMeta m : pdfOps.values()) {
            if (m.category() == category && isEnabled(m)) {
                out.add(fitted(m));
            }
        }
        out.sort((a, b) -> a.id().compareTo(b.id()));
        return out;
    }

    public Optional<OperationMeta> findByOperationId(String id) {
        OperationMeta meta = pdfOps.get(id);
        return meta != null && isEnabled(meta) ? Optional.of(fitted(meta)) : Optional.empty();
    }

    private boolean isEnabled(OperationMeta meta) {
        return isOperationAllowed(meta.id())
                && endpointConfiguration.isEndpointEnabledForUri(meta.endpointPath())
                && (meta.category() != OperationCategory.AI || isAiToolEnabled(meta.id()));
    }

    /** Mirrors AiFeatureGate, so a switched-off AI tool is hidden rather than failing. */
    private boolean isAiToolEnabled(String id) {
        ApplicationProperties.AiEngine ai = applicationProperties.getAiEngine();
        if (ai == null || !ai.isEnabled()) {
            return false;
        }
        ApplicationProperties.AiEngine.Features features = ai.getFeatures();
        return switch (id) {
            case "create-pdf-from-html-agent" -> features.isCreatePdf();
            case "math-auditor-agent" -> features.isMathAuditor();
            case "pdf-comment-agent" -> features.isPdfComment();
            case "classify-and-label" -> features.isClassify();
            default -> false;
        };
    }

    /** Only POST/PUT endpoints are exposed as tools; DELETE and GET are excluded. */
    static boolean isInvocableMethod(Set<RequestMethod> methods) {
        return methods.contains(RequestMethod.POST) || methods.contains(RequestMethod.PUT);
    }

    static String extractOpId(String pattern, OperationCategory category) {
        if (category.urlPrefix() == null || !pattern.startsWith(category.urlPrefix())) {
            return null;
        }
        String tail = pattern.substring(category.urlPrefix().length());
        if (tail.isBlank() || tail.contains("{")) {
            return null;
        }
        if (category == OperationCategory.CONVERT) {
            // Conversions are /convert/{from}/{to}: "pdf/word" becomes "pdf-to-word".
            String[] parts = tail.split("/");
            boolean editorInternal = tail.contains("text-editor");
            return parts.length == 2 && !editorInternal ? parts[0] + "-to-" + parts[1] : null;
        }
        // Skip nested paths elsewhere.
        return tail.contains("/") ? null : tail;
    }

    /** The enabled, allowed operation behind an endpoint path, e.g. a stored pipeline step. */
    public Optional<OperationMeta> findByEndpointPath(String path) {
        if (path == null) {
            return Optional.empty();
        }
        for (OperationMeta meta : pdfOps.values()) {
            if (path.equals(meta.endpointPath())) {
                return findByOperationId(meta.id());
            }
        }
        return Optional.empty();
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
