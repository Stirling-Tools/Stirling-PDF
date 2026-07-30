package stirling.software.common.service;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;

/**
 * Reads every {@link ToolIO} declaration off its handler method at startup and serves it by
 * endpoint path.
 *
 * <p>This replaces parsing the same information back out of prose in the OpenAPI description, which
 * meant the application had to fetch its own {@code /v1/api-docs} over HTTP before it could answer
 * "what does this endpoint accept". Reading the annotations directly removes that round trip and
 * turns a silently unresolvable type name into a compile error.
 */
@Slf4j
@Service
public class ToolIORegistry implements ToolMetadataService, ToolIOSource {

    private final ApplicationContext applicationContext;

    // Written once on the Spring startup thread during ContextRefreshedEvent, read on HTTP request
    // threads. Spring's lifecycle establishes happens-before, so no volatile is needed (same
    // reasoning as AiEngineEndpointResolver).
    private Map<String, ToolIOSpec> specsByPath = Map.of();

    // Deliberately the only constructor: a second one leaves Spring unable to choose, and it
    // falls back to looking for a no-arg constructor that does not exist.
    public ToolIORegistry(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    /**
     * A registry over a known set of declarations, rather than ones discovered from the context.
     */
    static ToolIORegistry forSpecs(Map<String, ToolIOSpec> specs) {
        ToolIORegistry registry = new ToolIORegistry(null);
        registry.specsByPath = Map.copyOf(specs);
        return registry;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void discoverToolIO() {
        Map<String, ToolIOSpec> discovered = new TreeMap<>();
        for (RequestMappingHandlerMapping mapping :
                applicationContext.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            mapping.getHandlerMethods()
                    .forEach((info, handler) -> register(discovered, info, handler));
        }
        specsByPath = Map.copyOf(discovered);
        log.debug("Discovered {} endpoints declaring @ToolIO", specsByPath.size());
    }

    private static void register(
            Map<String, ToolIOSpec> target, RequestMappingInfo info, HandlerMethod handler) {
        ToolIO annotation = handler.getMethodAnnotation(ToolIO.class);
        if (annotation == null) {
            return;
        }
        ToolIOSpec spec = ToolIOSpec.from(annotation);
        for (String pattern : extractPatterns(info)) {
            target.put(pattern, spec);
        }
    }

    @Override
    public Optional<ToolIOSpec> find(String operationPath) {
        return Optional.ofNullable(specsByPath.get(operationPath));
    }

    /** Every declaration, keyed by endpoint path. */
    public Map<String, ToolIOSpec> all() {
        return specsByPath;
    }

    @Override
    public boolean isMultiInput(String operationPath) {
        return find(operationPath).map(spec -> spec.arity().isMultiInput()).orElse(false);
    }

    @Override
    public List<String> getExtensionTypes(boolean output, String operationPath) {
        Optional<ToolIOSpec> spec = find(operationPath);
        if (spec.isEmpty()) {
            return null;
        }
        List<String> extensions =
                output
                        ? spec.get().resolveOutput().format().getExtensions()
                        : spec.get().acceptedExtensions();
        // An empty list means the endpoint places no restriction, which callers express as null.
        return extensions.isEmpty() ? null : extensions;
    }

    @Override
    public boolean shouldUnpackZipResponse(String operationPath) {
        // A multi-output endpoint zips its results purely as transport, so the caller unpacks them.
        // A single-output endpoint declaring ToolFormat.ZIP means the archive is the deliverable
        // (get-attachments), and stays packed.
        return find(operationPath)
                .map(spec -> spec.resolveOutput().arity().isMultiOutput())
                .orElse(false);
    }

    private static Set<String> extractPatterns(RequestMappingInfo info) {
        try {
            Method getDirectPaths = info.getClass().getMethod("getDirectPaths");
            Object result = getDirectPaths.invoke(info);
            if (result instanceof Set<?> set) {
                Set<String> patterns = new HashSet<>();
                for (Object value : set) {
                    if (value instanceof String s) {
                        patterns.add(s);
                    }
                }
                return patterns;
            }
        } catch (Exception e) {
            log.trace("getDirectPaths unavailable on RequestMappingInfo", e);
        }
        return Set.of();
    }
}
