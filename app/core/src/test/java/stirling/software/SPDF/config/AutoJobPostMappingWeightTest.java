package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.core.type.classreading.MetadataReaderFactory;
import org.springframework.core.type.filter.TypeFilter;

import stirling.software.common.annotations.AutoJobPostMapping;

/**
 * Build-time guardrail: every {@link AutoJobPostMapping} method must declare an explicit {@code
 * resourceWeight}.
 *
 * <p>The credits interceptor multiplies {@code resourceWeight} into the per-call charge. An
 * endpoint that falls through to the annotation default produces a charge derived from a value
 * nobody chose — silently under- or over-billing depending on the endpoint's true cost. Forcing
 * each method to pick a value from {@link stirling.software.common.enumeration.ResourceWeight}
 * keeps the choice deliberate.
 *
 * <p>The annotation's default is {@link Integer#MIN_VALUE} (a sentinel). Runtime readers clamp the
 * value into {@code [1, 100]}, so a missed declaration can't crash production — this test is the
 * contract, the clamp is the safety net.
 *
 * <p>Lives in {@code :stirling-pdf} (core) because that's the module whose compile classpath
 * transitively sees every other module's controllers ({@code :common}, {@code :proprietary}, and
 * {@code :saas} when enabled).
 */
class AutoJobPostMappingWeightTest {

    private static final String SCAN_BASE_PACKAGE = "stirling.software";

    @Test
    void everyAutoJobPostMappingDeclaresExplicitResourceWeight() throws Exception {
        List<String> offenders = findOffendingMethods();

        assertTrue(
                offenders.isEmpty(),
                () ->
                        "The following @AutoJobPostMapping methods do not declare an explicit"
                                + " resourceWeight. Pick a value from"
                                + " stirling.software.common.enumeration.ResourceWeight (SMALL,"
                                + " MEDIUM, LARGE, XLARGE) and add it to the annotation:\n  - "
                                + String.join("\n  - ", offenders));
    }

    private List<String> findOffendingMethods() throws IOException, ClassNotFoundException {
        List<String> offenders = new ArrayList<>();
        for (Class<?> candidate : scanForCandidateClasses()) {
            for (Method method : candidate.getDeclaredMethods()) {
                AutoJobPostMapping annotation = method.getAnnotation(AutoJobPostMapping.class);
                if (annotation == null) {
                    continue;
                }
                if (annotation.resourceWeight() == Integer.MIN_VALUE) {
                    offenders.add(candidate.getName() + "#" + method.getName());
                }
            }
        }
        return offenders;
    }

    /**
     * Returns every class under {@link #SCAN_BASE_PACKAGE} that has an @AutoJobPostMapping method.
     */
    private List<Class<?>> scanForCandidateClasses() throws IOException, ClassNotFoundException {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        MetadataReaderFactory metadataReaderFactory = new CachingMetadataReaderFactory(resolver);

        String pattern = "classpath*:" + SCAN_BASE_PACKAGE.replace('.', '/') + "/**/*.class";
        Resource[] resources = resolver.getResources(pattern);

        // Pre-filter by reading annotation metadata from the class file so we don't have to load
        // every class on the test classpath just to find the few that are annotated.
        TypeFilter mentionsAutoJobPostMapping =
                (reader, factory) ->
                        reader.getAnnotationMetadata()
                                        .getAnnotatedMethods(AutoJobPostMapping.class.getName())
                                        .size()
                                > 0;

        List<Class<?>> matches = new ArrayList<>();
        for (Resource resource : resources) {
            if (!resource.isReadable()) {
                continue;
            }
            MetadataReader reader = metadataReaderFactory.getMetadataReader(resource);
            if (!mentionsAutoJobPostMapping.match(reader, metadataReaderFactory)) {
                continue;
            }
            matches.add(Class.forName(reader.getClassMetadata().getClassName()));
        }
        return matches;
    }

    /**
     * Sanity check that the classpath scan returns non-empty; otherwise the main test passes
     * vacuously.
     */
    @Test
    void scannerFindsAtLeastOneAutoJobPostMapping() throws Exception {
        long count =
                scanForCandidateClasses().stream()
                        .flatMap(c -> java.util.Arrays.stream(c.getDeclaredMethods()))
                        .filter(m -> m.isAnnotationPresent(AutoJobPostMapping.class))
                        .count();

        assertTrue(
                count > 10,
                () ->
                        "Expected the classpath scan to find many @AutoJobPostMapping methods but"
                                + " found only "
                                + count
                                + ". Scanner regression?");
    }

    @SuppressWarnings("unused")
    private static String describeCandidates(List<Class<?>> candidates) {
        return candidates.stream().map(Class::getName).collect(Collectors.joining(", "));
    }
}
