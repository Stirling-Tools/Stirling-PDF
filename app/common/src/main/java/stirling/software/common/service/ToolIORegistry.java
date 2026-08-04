package stirling.software.common.service;

import java.lang.reflect.Method;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.inject.Any;
import jakarta.enterprise.inject.spi.Bean;
import jakarta.enterprise.inject.spi.BeanManager;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;

/**
 * Reads every {@link ToolIO} declaration off its handler method at startup and serves it by
 * endpoint path. Replaces parsing the same information out of the description prose, which meant
 * fetching our own {@code /v1/api-docs} over HTTP first.
 *
 * <p>MIGRATION (Spring -> Quarkus): discovery previously enumerated Spring MVC's {@code
 * RequestMappingHandlerMapping} beans and read each {@code RequestMappingInfo}'s direct paths.
 * Quarkus/RESTEasy Reactive has no runtime handler-mapping registry, so the paths are rebuilt from
 * the JAX-RS annotations on the CDI beans instead: the resource class's {@code @Path} joined with
 * the method's {@code @Path} (falling back to {@link AutoJobPostMapping#value()} for a method that
 * only declares its route there).
 */
@Slf4j
@ApplicationScoped
public class ToolIORegistry implements ToolMetadataService, ToolIOSource {

    private final BeanManager beanManager;

    // Written on the startup thread, read on request threads. The container's lifecycle
    // establishes happens-before, so no volatile (same as AiEngineEndpointResolver).
    private Map<String, ToolIOSpec> specsByPath = Map.of();
    private boolean discovered = false;

    // Keep this the only constructor: with two, Arc cannot pick an injection point.
    @Inject
    public ToolIORegistry(BeanManager beanManager) {
        this.beanManager = beanManager;
    }

    /** A registry over known declarations rather than ones discovered from the container. */
    static ToolIORegistry forSpecs(Map<String, ToolIOSpec> specs) {
        ToolIORegistry registry = new ToolIORegistry(null);
        registry.specsByPath = Map.copyOf(specs);
        registry.discovered = true;
        return registry;
    }

    void onStart(@Observes StartupEvent event) {
        discoverToolIO();
    }

    /**
     * Idempotent, and also called lazily on first read: the OpenAPI filter that publishes these
     * declarations runs at its own point in startup, which is not ordered against this observer.
     */
    public synchronized void discoverToolIO() {
        if (discovered || beanManager == null) {
            return;
        }
        Map<String, ToolIOSpec> specs = new TreeMap<>();
        for (Bean<?> bean : beanManager.getBeans(Object.class, Any.Literal.INSTANCE)) {
            register(specs, bean.getBeanClass());
        }
        specsByPath = Map.copyOf(specs);
        discovered = true;
        log.debug("Discovered {} endpoints declaring @ToolIO", specsByPath.size());
    }

    private static void register(Map<String, ToolIOSpec> target, Class<?> resourceClass) {
        jakarta.ws.rs.Path classPath = resourceClass.getAnnotation(jakarta.ws.rs.Path.class);
        if (classPath == null) {
            return;
        }
        for (Method method : resourceClass.getMethods()) {
            ToolIO annotation = method.getAnnotation(ToolIO.class);
            if (annotation == null) {
                continue;
            }
            ToolIOSpec spec = ToolIOSpec.from(annotation);
            for (String pattern : extractPatterns(classPath, method)) {
                target.put(pattern, spec);
            }
        }
    }

    @Override
    public Optional<ToolIOSpec> find(String operationPath) {
        if (!discovered) {
            discoverToolIO();
        }
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
        List<String> extensions =
                output
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

    private static Set<String> extractPatterns(jakarta.ws.rs.Path classPath, Method handlerMethod) {
        Set<String> patterns = new LinkedHashSet<>();
        jakarta.ws.rs.Path methodPath = handlerMethod.getAnnotation(jakarta.ws.rs.Path.class);
        if (methodPath != null) {
            patterns.add(join(classPath.value(), methodPath.value()));
            return patterns;
        }
        // Routing lives on @AutoJobPostMapping for endpoints that never got their own @Path.
        AutoJobPostMapping autoJob = handlerMethod.getAnnotation(AutoJobPostMapping.class);
        if (autoJob != null) {
            for (String value : autoJob.value()) {
                patterns.add(join(classPath.value(), value));
            }
        }
        return patterns;
    }

    private static String join(String base, String suffix) {
        String head = normalise(base);
        String tail = normalise(suffix);
        if (tail.isEmpty()) {
            return head;
        }
        return head.isEmpty() ? tail : head + tail;
    }

    /** Leading slash, no trailing one, so the two halves concatenate cleanly. */
    private static String normalise(String path) {
        if (path == null || path.isBlank() || "/".equals(path)) {
            return "";
        }
        String trimmed = path.trim();
        if (!trimmed.startsWith("/")) {
            trimmed = "/" + trimmed;
        }
        while (trimmed.length() > 1 && trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }
}
