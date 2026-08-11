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
 * endpoint path. Replaces parsing the same information out of the description prose, which meant
 * fetching our own {@code /v1/api-docs} over HTTP first.
 */
@Slf4j
@Service
public class ToolIORegistry implements ToolMetadataService, ToolIOSource {

    private final ApplicationContext applicationContext;

    // Written on the startup thread, read on request threads. Spring's lifecycle establishes
    // happens-before, so no volatile (same as AiEngineEndpointResolver).
    private Map<String, ToolIOSpec> specsByPath = Map.of();

    // Keep this the only constructor: with two, Spring falls back to a no-arg one that isn't here.
    public ToolIORegistry(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    /** A registry over known declarations rather than ones discovered from the context. */
    static ToolIORegistry forSpecs(Map<String, ToolIOSpec> specs) {
        ToolIORegistry registry = new ToolIORegistry(null);
        registry.specsByPath = Map.copyOf(specs);
        return registry;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void discoverToolIO() {
        Map<String, ToolIOSpec> discovered = new TreeMap<>();
        for (RequestMappingHandlerMapping mapping : applicationContext
                .getBeansOfType(RequestMappingHandlerMapping.class)
                .values()) {
            mapping.getHandlerMethods().forEach((info, handler) -> register(discovered, info, handler));
        }
        specsByPath = Map.copyOf(discovered);
        log.debug("Discovered {} endpoints declaring @ToolIO", specsByPath.size());
    }

    private static void register(Map<String, ToolIOSpec> target, RequestMappingInfo info, HandlerMethod handler) {
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
        List<String> extensions = output
                ? spec.get().resolveOutput().format().getExtensions()
                : spec.get().acceptedExtensions();
        // Callers express "no restriction" as null.
        return extensions.isEmpty() ? null : extensions;
    }

    @Override
    public boolean shouldUnpackZipResponse(String operationPath) {
        // Multi-output zips purely as transport. A single-output ZIP is the deliverable
        // (extract-attachments) and stays packed.
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
