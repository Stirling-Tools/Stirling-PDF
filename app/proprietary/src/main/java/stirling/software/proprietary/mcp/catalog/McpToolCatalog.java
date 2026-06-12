package stirling.software.proprietary.mcp.catalog;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

import io.quarkus.runtime.StartupEvent;

import io.swagger.v3.oas.annotations.Operation;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Discovers MCP-exposable operations and caches a per-op {@link OperationMeta}. Refreshed on
 * application startup ({@code @Observes StartupEvent}) and filtered on read by {@link
 * EndpointConfiguration#isEndpointEnabledForUri}. AI capabilities are fed in via {@link
 * #replaceAiCapabilities}.
 */
@Slf4j
@ApplicationScoped
// TODO: Migration required - the original @ConditionalOnProperty(name = "mcp.enabled",
// havingValue = "true") gated this bean on a runtime property. Quarkus build-time conditions
// (@io.quarkus.arc.lookup.LookupIfProperty / @io.quarkus.arc.profile.IfBuildProfile) cannot honour
// a purely runtime toggle. The bean is now always present; callers must guard on
// applicationProperties.getMcp() / a runtime "mcp.enabled" check, or wire @LookupIfProperty on the
// injection points once "mcp.enabled" is promoted to a build-time property.
public class McpToolCatalog {

    private static final String WRITE_SCOPE = "mcp.tools.write";

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

    @Inject
    public McpToolCatalog(
            EndpointConfiguration endpointConfiguration,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper) {
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

    void discover(@Observes StartupEvent event) {
        pdfOps.clear();
        // TODO: Migration required - endpoint discovery relied on Spring MVC's
        // RequestMappingHandlerMapping (ApplicationContext.getBeansOfType(...) ->
        // mapping.getHandlerMethods()) to enumerate every @RequestMapping/@PostMapping handler,
        // its URL patterns (RequestMappingInfo#getDirectPaths), its HTTP methods
        // (RequestMethod POST/PUT), and the HandlerMethod/MethodParameter reflection used to build
        // request schemas. Quarkus/RESTEasy Reactive has no equivalent runtime registry of JAX-RS
        // resources. To restore catalog population, replace this with one of:
        //   (a) a build-time scan via a Quarkus extension / @io.quarkus.runtime.annotations.Recorder
        //       over Jandex-indexed @Path + @POST/@PUT methods, or
        //   (b) a custom registry populated as endpoints register themselves, or
        //   (c) classpath reflection (Jandex CombinedIndexBuildItem) over the @XxxApi-annotated
        //       resource classes.
        // The per-handler helpers below (buildMeta/paramSchemaFor/firstComplexParamType/indexOne/
        // extractPatterns/isInvocableMethod) all depended on Spring MVC types and have been removed;
        // the schema-generation logic (SimpleSchemaGenerator) and OperationMeta model are reusable
        // once a Quarkus-native handler enumeration is supplied.
        log.info("MCP tool catalog discovered {} PDF operation(s)", pdfOps.size());
    }

    private OperationMeta buildMeta(
            String opId, OperationCategory category, String url, Method method) {
        Operation opAnno = method.getAnnotation(Operation.class);
        String summary =
                opAnno != null && !opAnno.summary().isBlank()
                        ? opAnno.summary()
                        : prettifyOpId(opId);
        // TODO: Migration required - request body type was previously resolved from Spring's
        // HandlerMethod#getMethodParameters(); resolve the first complex parameter type via plain
        // reflection on the JAX-RS resource method instead, then call schemaGenerator.toSchema(...).
        ObjectNode schema = paramSchemaFor(method);
        // Every mutating endpoint requires the write scope.
        return new OperationMeta(
                opId,
                category,
                summary,
                schema,
                WRITE_SCOPE,
                OperationMeta.Target.JAVA_ENDPOINT,
                url,
                method);
    }

    private ObjectNode paramSchemaFor(Method method) {
        Optional<Class<?>> bodyType = firstComplexParamType(method);
        return bodyType.map(schemaGenerator::toSchema).orElseGet(() -> emptyObjectSchema());
    }

    private ObjectNode emptyObjectSchema() {
        ObjectNode out = objectMapper.createObjectNode();
        out.put("type", "object");
        out.put("additionalProperties", true);
        return out;
    }

    private Optional<Class<?>> firstComplexParamType(Method method) {
        for (Class<?> type : method.getParameterTypes()) {
            if (type.isPrimitive() || type == String.class || type.getName().startsWith("java.")) {
                continue;
            }
            // Skip container-managed parameter types (HttpServletRequest, Principal, etc.).
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

    private static String prettifyOpId(String id) {
        return id.replace('-', ' ');
    }

    public Map<String, OperationMeta> snapshotPdfOps() {
        return new LinkedHashMap<>(pdfOps);
    }
}
