package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOSpec;

/**
 * Every document-transforming endpoint must declare its I/O, or it becomes a hole in the
 * compatibility graph: an undeclared step reads as "cannot tell" and nothing past it is checked.
 *
 * <p>The rest pins the declarations that were corrected on the way out of the description prose,
 * where several disagreed with what the endpoint actually does.
 */
class ToolIODeclarationCoverageTest {

    /** The namespaces whose endpoints act on documents. */
    private static final List<String> TOOL_NAMESPACES =
            List.of(
                    "/api/v1/general/",
                    "/api/v1/misc/",
                    "/api/v1/security/",
                    "/api/v1/convert/",
                    "/api/v1/filter/",
                    "/api/v1/integration/");

    /**
     * Not document transforms, so nothing to declare. A path exempts everything nested under it.
     * Keep it short: if you are adding a real tool, annotate it instead.
     */
    private static final List<String> EXEMPT =
            List.of(
                    // Interactive editing sessions: page fragments and cache handles, not
                    // documents.
                    "/api/v1/convert/pdf/text-editor",
                    "/api/v1/convert/text-editor/pdf",
                    // Signing sessions, certificate checks and hardware token enumeration; the
                    // signing tool itself is /api/v1/security/cert-sign, which is declared.
                    "/api/v1/security/cert-sign/sessions",
                    "/api/v1/security/cert-sign/validate-certificate",
                    "/api/v1/security/cert-sign/hardware");

    private record Scan(Set<String> required, Map<String, ToolIOSpec> declared) {}

    private static final Scan SCAN = scan();
    private static final Map<String, ToolIOSpec> DECLARED = SCAN.declared();

    @Test
    void everyToolEndpointDeclaresItsIo() {
        List<String> missing =
                SCAN.required().stream()
                        .filter(path -> !DECLARED.containsKey(path))
                        .sorted()
                        .toList();
        assertTrue(
                missing.isEmpty(),
                () ->
                        "These tool endpoints are missing a @ToolIO declaration. Add one so a"
                                + " pipeline containing them can be checked before it runs, or"
                                + " exempt them in EXEMPT with a reason:\n  "
                                + String.join("\n  ", missing));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                // Splitters emit a set of documents; the archive is only transport.
                "/api/v1/general/split-pages",
                "/api/v1/general/split-pdf-by-sections",
                "/api/v1/general/split-pdf-by-chapters",
                "/api/v1/general/split-by-size-or-count",
                "/api/v1/general/split-for-poster-print",
                "/api/v1/misc/auto-split-pdf",
                "/api/v1/misc/extract-images",
                "/api/v1/misc/extract-image-scans",
                // Corrected: both were declared single-output but return an archive of results.
                "/api/v1/misc/remove-blanks",
                "/api/v1/convert/pdf/csv"
            })
    void multiResultEndpointsAreUnpacked(String path) {
        assertTrue(spec(path).resolveOutput().arity().isMultiOutput(), path);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                // The archive itself is the deliverable.
                "/api/v1/misc/extract-attachments",
                // A page of HTML plus the assets it references; unpacking scatters them.
                "/api/v1/convert/pdf/html",
                "/api/v1/general/rotate-pdf",
                "/api/v1/general/merge-pdfs",
                // Corrected: was declared MIMO, but it returns one overlaid document.
                "/api/v1/general/overlay-pdfs",
                // Sits under the exempted cert-sign session paths; pinned so it stays declared.
                "/api/v1/security/cert-sign"
            })
    void singleResultEndpointsAreNotUnpacked(String path) {
        assertFalse(spec(path).resolveOutput().arity().isMultiOutput(), path);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/api/v1/general/merge-pdfs",
                "/api/v1/general/overlay-pdfs",
                "/api/v1/convert/img/pdf"
            })
    void multiInputEndpointsTakeEveryFileAtOnce(String path) {
        assertTrue(spec(path).arity().isMultiInput(), path);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                // Corrected: the multiple files are the attachments, a secondary field. The
                // primary stream is one document in, one out, so these must not fan in.
                "/api/v1/misc/add-attachments",
                "/api/v1/misc/delete-attachment",
                "/api/v1/misc/rename-attachment"
            })
    void attachmentEditsActOnOneDocument(String path) {
        assertFalse(spec(path).arity().isMultiInput(), path);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                // Corrected: these declared Output:Boolean, which would have reported every chain
                // after a filter as broken. A filter returns the document, or 204 to drop it.
                "/api/v1/filter/filter-contains-text",
                "/api/v1/filter/filter-contains-image",
                "/api/v1/filter/filter-file-size",
                "/api/v1/filter/filter-page-count",
                "/api/v1/filter/filter-page-rotation",
                "/api/v1/filter/filter-page-size"
            })
    void filtersPassTheDocumentThrough(String path) {
        ToolIOSpec spec = spec(path);
        assertTrue(spec.acceptsFormat(ToolFormat.PDF), path);
        assertEquals(ToolFormat.PDF, spec.resolveOutput().format(), path);
    }

    @Test
    void addPasswordProducesAnEncryptedDocument() {
        ToolIOSpec spec = spec("/api/v1/security/add-password");
        assertEquals(
                ToolFormat.PDF_ENCRYPTED,
                spec.resolveOutput(Map.of("password", "hunter2", "ownerPassword", "")).format());
    }

    @Test
    void addPasswordWithNoPasswordsOnlySetsPermissions() {
        // The controller returns the document unencrypted when both passwords are absent, so a
        // permissions-only call must not close the chain to every downstream tool.
        ToolIOSpec spec = spec("/api/v1/security/add-password");
        assertEquals(
                ToolFormat.PDF,
                spec.resolveOutput(Map.of("password", "", "ownerPassword", "")).format());
    }

    @Test
    void onlyRemovePasswordAcceptsAnEncryptedDocument() {
        assertTrue(
                spec("/api/v1/security/remove-password").acceptsFormat(ToolFormat.PDF_ENCRYPTED));
        List<String> accepting =
                DECLARED.entrySet().stream()
                        .filter(e -> e.getValue().acceptsFormat(ToolFormat.PDF_ENCRYPTED))
                        .map(Map.Entry::getKey)
                        .filter(path -> !path.equals("/api/v1/security/remove-password"))
                        .filter(path -> !spec(path).accepts().contains(ToolFormat.ANY))
                        .sorted()
                        .toList();
        assertTrue(
                accepting.isEmpty(),
                () ->
                        "Only remove-password should accept an encrypted PDF. If one of these"
                                + " genuinely handles encryption, say so in its @ToolIO:\n  "
                                + String.join("\n  ", accepting));
    }

    private static ToolIOSpec spec(String path) {
        ToolIOSpec spec = DECLARED.get(path);
        if (spec == null) {
            throw new AssertionError("No @ToolIO declared for " + path);
        }
        return spec;
    }

    private static Scan scan() {
        Set<String> required = new HashSet<>();
        Map<String, ToolIOSpec> declared = new HashMap<>();
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RequestMapping.class, true, true));

        for (BeanDefinition definition : scanner.findCandidateComponents("stirling.software")) {
            Class<?> controller = loadClass(definition.getBeanClassName());
            if (controller == null) {
                continue;
            }
            RequestMapping base =
                    AnnotatedElementUtils.findMergedAnnotation(controller, RequestMapping.class);
            if (base == null || base.value().length == 0) {
                continue;
            }
            for (Method method : controller.getDeclaredMethods()) {
                ToolIO declaration =
                        AnnotatedElementUtils.findMergedAnnotation(method, ToolIO.class);
                for (String path : mappedPaths(method)) {
                    String full = join(base.value()[0], path);
                    if (!requiresDeclaration(full)) {
                        continue;
                    }
                    required.add(full);
                    if (declaration != null) {
                        declared.put(full, ToolIOSpec.from(declaration));
                    }
                }
            }
        }
        return new Scan(required, declared);
    }

    private static boolean requiresDeclaration(String path) {
        if (TOOL_NAMESPACES.stream().noneMatch(path::startsWith)) {
            return false;
        }
        // A path variable means it addresses a resource, not a document to transform.
        if (path.contains("{")) {
            return false;
        }
        return EXEMPT.stream().noneMatch(e -> path.equals(e) || path.startsWith(e + "/"));
    }

    private static List<String> mappedPaths(Method method) {
        RequestMapping mapping =
                AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
        if (mapping == null) {
            return List.of();
        }
        boolean writes =
                AnnotatedElementUtils.hasAnnotation(method, PostMapping.class)
                        || AnnotatedElementUtils.hasAnnotation(method, PutMapping.class)
                        || Set.of(mapping.method()).stream()
                                .anyMatch(m -> m.name().equals("POST") || m.name().equals("PUT"));
        if (!writes) {
            return List.of();
        }
        return mapping.value().length == 0 ? List.of("") : Arrays.asList(mapping.value());
    }

    private static String join(String base, String path) {
        if (path.isEmpty()) {
            return base;
        }
        return base.endsWith("/") || path.startsWith("/") ? base + path : base + "/" + path;
    }

    private static Class<?> loadClass(String name) {
        try {
            return name == null ? null : Class.forName(name);
        } catch (Throwable e) {
            // Absent optional dependencies in this flavor; not this test's concern.
            return null;
        }
    }
}
