package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.lang.reflect.Method;
import java.security.CodeSource;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.core.type.classreading.MetadataReaderFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import stirling.software.common.annotations.ConditionalOnProcessor;

/**
 * Guards the URL surface of an editor-only build: every endpoint whose path belongs to the
 * Processor must sit on a class carrying {@link ConditionalOnProcessor}, so flipping {@code
 * ProcessorFeature.ENABLED} unmaps it.
 *
 * <p>Complements {@code ProcessorConditionalTest}, which scans the Processor's two packages. That
 * test cannot see a Processor endpoint declared elsewhere — {@code PipelineController} lives in
 * core and {@code ClassifyLabelController} under {@code proprietary.controller.api}, and both
 * shipped ungated until this test existed. Anchoring on the URL instead of the package is what
 * catches those.
 *
 * <p>Lives in {@code :stirling-pdf} (core) because that is the module whose classpath transitively
 * sees every other module's controllers.
 */
class ProcessorEndpointSurfaceTest {

    private static final String SCAN_BASE_PACKAGE = "stirling.software";

    /** Path prefixes owned entirely by the Processor. */
    private static final List<String> PROCESSOR_PATH_PREFIXES =
            List.of(
                    "/api/v1/policies",
                    "/api/v1/sources",
                    // also covers /api/v1/integrations
                    "/api/v1/integration",
                    "/api/v1/webhooks",
                    "/api/v1/pipeline",
                    "/api/v1/admin/settings/policies",
                    // Only these two sub-trees of /api/v1/proprietary/ui-data belong to the
                    // portal; its siblings (audit, teams, account, database) serve the editor.
                    "/api/v1/proprietary/ui-data/documents",
                    "/api/v1/proprietary/ui-data/infrastructure");

    /**
     * Processor endpoints sharing a namespace with non-Processor ones, so they can only be matched
     * exactly. {@code /api/v1/ai/tools} also holds the create-pdf, math-auditor and pdf-comment
     * agents, which are editor features and must survive the flag.
     */
    private static final List<String> PROCESSOR_EXACT_PATHS =
            List.of("/api/v1/ai/tools/classify-and-label");

    @Test
    void everyProcessorEndpointSitsOnAGatedController() throws Exception {
        Set<String> offenders = new TreeSet<>();
        for (Class<?> controller : scanForControllers()) {
            if (AnnotatedElementUtils.hasAnnotation(controller, ConditionalOnProcessor.class)) {
                continue;
            }
            for (String path : mappedPaths(controller)) {
                if (isProcessorPath(path)) {
                    offenders.add(path + "  (" + controller.getName() + ")");
                }
            }
        }
        assertTrue(
                offenders.isEmpty(),
                () ->
                        "These endpoints stay mapped on an editor-only build. Add"
                                + " @ConditionalOnProcessor to the controller, or - if the endpoint"
                                + " is genuinely not part of the Processor - narrow the path lists"
                                + " in this test:\n  - "
                                + String.join("\n  - ", offenders));
    }

    /** Namespaces the Processor shares with the editor, and what must survive in each. */
    private static final Map<String, List<String>> SHARED_NAMESPACES =
            Map.of(
                    "/api/v1/ai/tools/",
                            List.of(
                                    "/api/v1/ai/tools/create-pdf-from-html-agent",
                                    "/api/v1/ai/tools/math-auditor-agent",
                                    "/api/v1/ai/tools/pdf-comment-agent"),
                    "/api/v1/proprietary/ui-data/",
                            List.of(
                                    "/api/v1/proprietary/ui-data/account",
                                    "/api/v1/proprietary/ui-data/teams",
                                    "/api/v1/proprietary/ui-data/audit-events"));

    @Test
    void nonProcessorEndpointsInSharedNamespacesStayMapped() throws Exception {
        assumeTrue(proprietaryOnClasspath(), SKIP_REASON);
        // If a prefix ever swallowed one of these namespaces, editor features would vanish from an
        // editor-only server - the exact opposite of what the flag promises.
        Set<String> ungated = new TreeSet<>();
        for (Class<?> controller : scanForControllers()) {
            if (AnnotatedElementUtils.hasAnnotation(controller, ConditionalOnProcessor.class)) {
                continue;
            }
            ungated.addAll(mappedPaths(controller));
        }
        for (Map.Entry<String, List<String>> namespace : SHARED_NAMESPACES.entrySet()) {
            for (String mustSurvive : namespace.getValue()) {
                assertTrue(
                        ungated.contains(mustSurvive),
                        () ->
                                mustSurvive
                                        + " is an editor endpoint but is gated or gone; the"
                                        + " Processor shares "
                                        + namespace.getKey()
                                        + " with it");
                assertFalse(
                        isProcessorPath(mustSurvive),
                        () -> mustSurvive + " is claimed as a Processor path but is an editor one");
            }
        }
    }

    @Test
    void everyDeclaredProcessorPathIsActuallyClaimedBySomeController() throws Exception {
        assumeTrue(proprietaryOnClasspath(), SKIP_REASON);
        // A prefix nobody serves means the list has drifted from the code, and the guard above
        // would pass vacuously for that entry.
        Set<String> allPaths = new LinkedHashSet<>();
        for (Class<?> controller : scanForControllers()) {
            allPaths.addAll(mappedPaths(controller));
        }
        assertTrue(allPaths.size() > 100, "scan found only " + allPaths.size() + " endpoints");

        Set<String> unclaimed = new TreeSet<>();
        for (String prefix : PROCESSOR_PATH_PREFIXES) {
            if (allPaths.stream().noneMatch(p -> p.startsWith(prefix))) {
                unclaimed.add(prefix);
            }
        }
        for (String exact : PROCESSOR_EXACT_PATHS) {
            if (!allPaths.contains(exact)) {
                unclaimed.add(exact);
            }
        }
        assertTrue(
                unclaimed.isEmpty(),
                () -> "declared Processor paths that no controller maps any more: " + unclaimed);
    }

    private static final String SKIP_REASON =
            "core flavour builds without :proprietary, so it maps none of these paths";

    /** app/core/build.gradle only puts :proprietary on the classpath outside the core flavour. */
    private static boolean proprietaryOnClasspath() {
        try {
            Class.forName("stirling.software.proprietary.policy.controller.PolicyController");
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }

    private static boolean isProcessorPath(String path) {
        return PROCESSOR_EXACT_PATHS.contains(path)
                || PROCESSOR_PATH_PREFIXES.stream().anyMatch(path::startsWith);
    }

    /** Class-level base joined with each handler method's own path. */
    private static Set<String> mappedPaths(Class<?> controller) {
        Set<String> paths = new LinkedHashSet<>();
        RequestMapping base =
                AnnotatedElementUtils.findMergedAnnotation(controller, RequestMapping.class);
        List<String> bases = base == null ? List.of("") : pathsOf(base);
        for (Method method : controller.getDeclaredMethods()) {
            RequestMapping mapping =
                    AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
            if (mapping == null) {
                continue;
            }
            List<String> suffixes = pathsOf(mapping);
            for (String prefix : bases) {
                for (String suffix : suffixes) {
                    paths.add(join(prefix, suffix));
                }
            }
        }
        return paths;
    }

    private static List<String> pathsOf(RequestMapping mapping) {
        String[] declared = mapping.path().length > 0 ? mapping.path() : mapping.value();
        return declared.length > 0 ? List.of(declared) : List.of("");
    }

    private static String join(String prefix, String suffix) {
        if (suffix.isEmpty()) {
            return prefix;
        }
        String left = prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix;
        String right = suffix.startsWith("/") ? suffix : "/" + suffix;
        return left + right;
    }

    /**
     * Every main-source class under {@link #SCAN_BASE_PACKAGE} that Spring would treat as a
     * controller. Reads class-file metadata first so only the handful of matches get loaded.
     */
    private static List<Class<?>> scanForControllers() throws IOException, ClassNotFoundException {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        MetadataReaderFactory metadataReaderFactory = new CachingMetadataReaderFactory(resolver);
        Resource[] resources =
                resolver.getResources(
                        "classpath*:" + SCAN_BASE_PACKAGE.replace('.', '/') + "/**/*.class");

        List<Class<?>> controllers = new ArrayList<>();
        for (Resource resource : resources) {
            if (!resource.isReadable()) {
                continue;
            }
            MetadataReader reader = metadataReaderFactory.getMetadataReader(resource);
            // Meta-annotations included: @RestController and the composed @...Api annotations
            // (@PipelineApi, @AdminApi) all resolve back to @Controller.
            if (!reader.getAnnotationMetadata().hasMetaAnnotation(Controller.class.getName())
                    && !reader.getAnnotationMetadata().hasAnnotation(Controller.class.getName())) {
                continue;
            }
            Class<?> type = Class.forName(reader.getClassMetadata().getClassName());
            if (!isTestClass(type)) {
                controllers.add(type);
            }
        }
        int floor = proprietaryOnClasspath() ? 40 : 20;
        assertTrue(
                controllers.size() > floor,
                "scan found only " + controllers.size() + " controllers - is it wired?");
        return controllers;
    }

    /** Test fixtures live under build/classes/java/test; main code does not. */
    private static boolean isTestClass(Class<?> type) {
        CodeSource source = type.getProtectionDomain().getCodeSource();
        if (source == null || source.getLocation() == null) {
            return false;
        }
        return source.getLocation().getPath().replace('\\', '/').contains("/classes/java/test");
    }
}
