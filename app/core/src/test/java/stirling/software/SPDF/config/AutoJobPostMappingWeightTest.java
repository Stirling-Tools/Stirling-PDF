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
 * Build-time guardrail: every {@link AutoJobPostMapping} must declare an explicit {@code
 * resourceWeight}.
 *
 * <p>What actually reads the weight today:
 *
 * <ul>
 *   <li>{@code UnifiedCreditInterceptor} — multiplies it into the per-call credit charge on the
 *       legacy credits engine. This is the only live consumer today.
 *   <li>{@code JobExecutorService} → {@code ResourceMonitor.shouldQueueJob(weight)} — would gate
 *       queue admission, BUT only when the endpoint sets {@code queueable=true}. No endpoint in
 *       the codebase currently does, so this path is wired but dormant.
 * </ul>
 *
 * <p>Under PAYG (per {@code notes/PAYG_DESIGN.md} §3.4 + PR-R5) the field is dropped from the
 * charging path entirely — PAYG bills per-document × per-process, not per-weight. The queueing
 * path remains as the field's only theoretical future consumer, and only the day someone enables
 * {@code queueable=true} on an endpoint.
 *
 * <p>Either way, a silent fallthrough is wrong: today it mis-charges legacy customers (the PR
 * #6384 review caught the smoking-gun version, where a {@code 1} default combined with
 * 50-magnitude intent meant heavy endpoints under-charged 50×), and after PAYG it would lie to
 * the queueing path the moment {@code queueable=true} gets adopted. Forcing an explicit value
 * keeps the choice deliberate.
 *
 * <p>The annotation's default is {@link Integer#MIN_VALUE} (a sentinel). Runtime readers clamp
 * into {@code [1, 100]} so a missed declaration doesn't crash production — this test is the
 * contract, the clamp is the safety net.
 *
 * <p>Lives in {@code :stirling-pdf} (core) because that's the module whose compile classpath
 * transitively sees every other module's controllers ({@code :common}, {@code :proprietary}, and
 * {@code :saas} when enabled).
 *
 * <p>Note: not every {@code @AutoJobPostMapping} is a PDF-tool run — the annotation also covers
 * lightweight metadata operations (e.g. {@code listAttachments}, {@code sendEmail}). The
 * guardrail applies uniformly because the credits interceptor doesn't discriminate by endpoint
 * shape, only by annotation presence.
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
     * Scan all classes under {@link #SCAN_BASE_PACKAGE} without requiring them to be Spring
     * components. We use Spring's class-file reader directly so the test doesn't depend on bean
     * configuration and stays cheap.
     */
    private List<Class<?>> scanForCandidateClasses() throws IOException, ClassNotFoundException {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        MetadataReaderFactory metadataReaderFactory = new CachingMetadataReaderFactory(resolver);

        String pattern = "classpath*:" + SCAN_BASE_PACKAGE.replace('.', '/') + "/**/*.class";
        Resource[] resources = resolver.getResources(pattern);

        // Lightweight pre-filter: keep only classes that mention @AutoJobPostMapping in their
        // bytecode (Spring's MetadataReader exposes annotated-method info without classloading).
        // This avoids initialising every class on the test classpath, which would otherwise touch
        // Spring beans, JDBC drivers, etc. just for a static lint.
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
     * Self-check: prove the scanner actually finds {@code @AutoJobPostMapping} methods. If a future
     * refactor breaks scanning, the main test would pass vacuously (zero offenders found because
     * zero candidates found) — this guards against that silent regression.
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
