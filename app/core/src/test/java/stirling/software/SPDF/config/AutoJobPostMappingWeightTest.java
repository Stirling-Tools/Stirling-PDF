package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.jboss.jandex.AnnotationInstance;
import org.jboss.jandex.AnnotationTarget;
import org.jboss.jandex.AnnotationValue;
import org.jboss.jandex.DotName;
import org.jboss.jandex.Index;
import org.jboss.jandex.Indexer;
import org.jboss.jandex.MethodInfo;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Build-time guardrail: every {@code @AutoJobPostMapping} method must declare an explicit {@code
 * resourceWeight}.
 *
 * <p>The credits interceptor multiplies {@code resourceWeight} into the per-call charge. An
 * endpoint that falls through to the annotation default produces a charge derived from a value
 * nobody chose - silently under- or over-billing depending on the endpoint's true cost. Forcing
 * each method to pick a value from {@link stirling.software.common.enumeration.ResourceWeight}
 * keeps the choice deliberate.
 *
 * <p>The annotation's default is {@link Integer#MIN_VALUE} (a sentinel). Runtime readers clamp the
 * value into {@code [1, 100]}, so a missed declaration can't crash production - this test is the
 * contract, the clamp is the safety net.
 *
 * <p>Lives in {@code :stirling-pdf} (core) because that's the module whose compile classpath
 * transitively sees every other module's controllers ({@code :common}, {@code :proprietary}, and
 * {@code :saas} when enabled).
 *
 * <p>MIGRATION (Spring -&gt; Quarkus): the previous Spring {@code MetadataReader} class-file scan
 * was replaced with Jandex (the indexer Quarkus itself uses). Both read annotation metadata
 * straight from bytecode, so no class on the test classpath has to be loaded just to find the few
 * that are annotated.
 */
class AutoJobPostMappingWeightTest {

    private static final String SCAN_PREFIX = "stirling/software/";
    private static final DotName AUTO_JOB_POST_MAPPING =
            DotName.createSimple("stirling.software.common.annotations.AutoJobPostMapping");

    /** {@code AutoJobPostMapping#resourceWeight()} default - "no explicit value chosen". */
    private static final int UNSET_WEIGHT = Integer.MIN_VALUE;

    private static Index index;

    @BeforeAll
    static void buildIndex() throws IOException {
        Indexer indexer = new Indexer();
        for (String entry : System.getProperty("java.class.path").split(File.pathSeparator)) {
            File root = new File(entry);
            if (!root.exists()) {
                continue;
            }
            if (root.isDirectory()) {
                indexClassDirectory(indexer, root.toPath());
            } else if (entry.endsWith(".jar")) {
                indexJar(indexer, root);
            }
        }
        index = indexer.complete();
    }

    @Test
    void everyAutoJobPostMappingDeclaresExplicitResourceWeight() {
        List<String> offenders = new ArrayList<>();
        for (AnnotationInstance annotation : index.getAnnotations(AUTO_JOB_POST_MAPPING)) {
            if (annotation.target().kind() != AnnotationTarget.Kind.METHOD) {
                continue;
            }
            AnnotationValue weight = annotation.value("resourceWeight");
            if (weight == null || weight.asInt() == UNSET_WEIGHT) {
                MethodInfo method = annotation.target().asMethod();
                offenders.add(method.declaringClass().name() + "#" + method.name());
            }
        }

        assertTrue(
                offenders.isEmpty(),
                () ->
                        "The following @AutoJobPostMapping methods do not declare an explicit"
                                + " resourceWeight. Pick a value from"
                                + " stirling.software.common.enumeration.ResourceWeight (SMALL,"
                                + " MEDIUM, LARGE, XLARGE) and add it to the annotation:\n  - "
                                + String.join("\n  - ", offenders));
    }

    /**
     * Sanity check that the classpath scan returns non-empty; otherwise the main test passes
     * vacuously.
     */
    @Test
    void scannerFindsAtLeastOneAutoJobPostMapping() {
        long count =
                index.getAnnotations(AUTO_JOB_POST_MAPPING).stream()
                        .filter(a -> a.target().kind() == AnnotationTarget.Kind.METHOD)
                        .count();

        assertTrue(
                count > 10,
                () ->
                        "Expected the classpath scan to find many @AutoJobPostMapping methods but"
                                + " found only "
                                + count
                                + ". Scanner regression?");
    }

    private static void indexClassDirectory(Indexer indexer, Path root) throws IOException {
        Path base = root.resolve(SCAN_PREFIX);
        if (!Files.isDirectory(base)) {
            return;
        }
        try (Stream<Path> classes = Files.walk(base)) {
            List<Path> classFiles =
                    classes.filter(p -> p.toString().endsWith(".class"))
                            .filter(p -> !p.getFileName().toString().equals("module-info.class"))
                            .toList();
            for (Path classFile : classFiles) {
                try (InputStream in = Files.newInputStream(classFile)) {
                    indexer.index(in);
                }
            }
        }
    }

    private static void indexJar(Indexer indexer, File jar) throws IOException {
        try (ZipFile zip = new ZipFile(jar)) {
            var entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry zipEntry = entries.nextElement();
                String name = zipEntry.getName();
                if (name.startsWith(SCAN_PREFIX)
                        && name.endsWith(".class")
                        && !name.endsWith("module-info.class")) {
                    try (InputStream in = zip.getInputStream(zipEntry)) {
                        indexer.index(in);
                    }
                }
            }
        }
    }
}
