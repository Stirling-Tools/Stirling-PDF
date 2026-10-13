package stirling.software.common.service;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

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

    // POST endpoints InternalApiClient may dispatch to, declared or not.
    private Set<String> dispatchablePaths = Set.of();
    private List<PathPattern> dispatchablePatterns = List.of();
    private Map<PathPattern, ToolIOSpec> patternedSpecs = Map.of();

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
        Set<String> dispatchable = new HashSet<>();
        for (RequestMappingHandlerMapping mapping :
                applicationContext.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            mapping.getHandlerMethods()
                    .forEach(
                            (info, handler) -> {
                                register(discovered, info, handler);
                                registerDispatchable(dispatchable, info, handler);
                            });
        }
        specsByPath = Map.copyOf(discovered);
        dispatchablePaths = Set.copyOf(dispatchable);
        dispatchablePatterns =
                dispatchable.stream()
                        .filter(ToolIORegistry::hasPattern)
                        .map(PathPatternParser.defaultInstance::parse)
                        .toList();
        Map<PathPattern, ToolIOSpec> patterns = new java.util.HashMap<>();
        discovered.forEach(
                (path, spec) -> {
                    if (hasPattern(path))
                        patterns.put(PathPatternParser.defaultInstance.parse(path), spec);
                });
        patternedSpecs = Map.copyOf(patterns);
        log.debug(
                "Discovered {} endpoints declaring @ToolIO, {} dispatchable",
                specsByPath.size(),
                dispatchablePaths.size());
    }

    private static void registerDispatchable(
            Set<String> target, RequestMappingInfo info, HandlerMethod handler) {
        Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
        if (!methods.isEmpty() && !methods.contains(RequestMethod.POST)) {
            return;
        }
        Set<MediaType> consumes = info.getConsumesCondition().getConsumableMediaTypes();
        if ((!consumes.isEmpty()
                        && consumes.stream()
                                .noneMatch(type -> type.includes(MediaType.MULTIPART_FORM_DATA)))
                || Arrays.stream(handler.getMethod().getParameters())
                        .anyMatch(parameter -> parameter.isAnnotationPresent(RequestBody.class))) {
            return;
        }
        for (String pattern : extractPatterns(info)) {
            String probe =
                    Arrays.stream(pattern.split("/", -1))
                            .map(segment -> hasPattern(segment) ? "path" : segment)
                            .collect(java.util.stream.Collectors.joining("/"));
            if (InternalApiClient.isDispatchable(probe)) {
                target.add(pattern);
            }
        }
    }

    private static void register(
            Map<String, ToolIOSpec> target, RequestMappingInfo info, HandlerMethod handler) {
        ToolIO annotation = handler.getMethodAnnotation(ToolIO.class);
        if (annotation == null) {
            return;
        }
        Method method = handler.getMethod();
        ToolIOSpec spec =
                ToolIOSpec.from(
                        annotation, param -> ToolIOParameterDefaults.resolve(method, param));
        for (String pattern : extractPatterns(info)) {
            target.put(pattern, spec);
        }
    }

    @Override
    public Optional<ToolIOSpec> find(String operationPath) {
        ToolIOSpec direct = specsByPath.get(operationPath);
        if (direct != null) return Optional.of(direct);
        PathContainer path = PathContainer.parsePath(operationPath);
        return patternedSpecs.entrySet().stream()
                .filter(entry -> entry.getKey().matches(path))
                .min(Map.Entry.comparingByKey(PathPattern.SPECIFICITY_COMPARATOR))
                .map(Map.Entry::getValue);
    }

    @Override
    public boolean isKnown(String operationPath) {
        // Empty only before discovery has run (or in forSpecs); rejecting every step then would
        // block every save.
        return dispatchablePaths.isEmpty()
                || (!hasPattern(operationPath) && dispatchablePaths.contains(operationPath))
                || (InternalApiClient.isDispatchable(operationPath)
                        && dispatchablePatterns.stream()
                                .anyMatch(
                                        pattern ->
                                                pattern.matches(
                                                        PathContainer.parsePath(operationPath))));
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

    private static boolean hasPattern(String path) {
        return path.indexOf('{') >= 0 || path.indexOf('*') >= 0 || path.indexOf('?') >= 0;
    }

    private static Set<String> extractPatterns(RequestMappingInfo info) {
        return info.getPatternValues();
    }
}
