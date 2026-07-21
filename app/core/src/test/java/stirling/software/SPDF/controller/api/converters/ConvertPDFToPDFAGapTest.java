package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.util.TempFileManager;

/**
 * Gap-filling unit tests for {@link ConvertPDFToPDFA}. Focuses on validation/option/error branches
 * and the small pure helpers, mocking the collaborators so that no external binary (ghostscript,
 * qpdf, libreoffice) or network is invoked.
 */
@DisplayName("ConvertPDFToPDFA gap tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPDFToPDFAGapTest {

    @TempDir Path tempDir;

    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private VeraPDFService veraPDFService;
    @Mock private TempFileManager tempFileManager;

    private ConvertPDFToPDFA newController() {
        return new ConvertPDFToPDFA(runtimePathConfig, veraPDFService, tempFileManager);
    }

    // ---- reflection helpers ----------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static <T> T invokeStatic(String methodName, Object... args) throws Exception {
        Method method = findMethod(methodName, args.length);
        method.setAccessible(true);
        try {
            return (T) method.invoke(null, args);
        } catch (InvocationTargetException e) {
            throw unwrap(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T invokeInstance(Object target, String methodName, Object... args)
            throws Exception {
        Method method = findMethod(methodName, args.length);
        method.setAccessible(true);
        try {
            return (T) method.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw unwrap(e);
        }
    }

    private static Method findMethod(String methodName, int argCount) {
        for (Method method : ConvertPDFToPDFA.class.getDeclaredMethods()) {
            if (method.getName().equals(methodName) && method.getParameterCount() == argCount) {
                return method;
            }
        }
        throw new IllegalStateException(
                "No method named " + methodName + " with " + argCount + " params");
    }

    private static Exception unwrap(InvocationTargetException e) {
        Throwable cause = e.getCause();
        if (cause instanceof Exception ex) {
            return ex;
        }
        return new RuntimeException(cause);
    }

    // ---- pdf builders ----------------------------------------------------------------------

    private PDDocument simplePdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(100, 700);
            cs.showText("hello world");
            cs.endText();
        }
        return document;
    }

    private byte[] simplePdfBytes() throws IOException {
        try (PDDocument document = simplePdf()) {
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("PdfaProfile.fromRequest token resolution")
    class PdfaProfileResolution {

        // invokes the enum's static fromRequest via reflection, then reads getPart()/displayName
        private Object resolveProfile(String token) throws Exception {
            Class<?> enumClass = null;
            for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
                if (inner.getSimpleName().equals("PdfaProfile")) {
                    enumClass = inner;
                }
            }
            assertThat(enumClass).isNotNull();
            Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
            m.setAccessible(true);
            return m.invoke(null, token);
        }

        private int partOf(Object profile) throws Exception {
            Method getPart = profile.getClass().getDeclaredMethod("getPart");
            getPart.setAccessible(true);
            return (int) getPart.invoke(profile);
        }

        private String suffixOf(Object profile) throws Exception {
            Method m = profile.getClass().getDeclaredMethod("outputSuffix");
            m.setAccessible(true);
            return (String) m.invoke(profile);
        }

        @Test
        @DisplayName("null token defaults to PDF/A-2b")
        void nullDefaultsToPdfA2() throws Exception {
            Object profile = resolveProfile(null);
            assertThat(partOf(profile)).isEqualTo(2);
            assertThat(suffixOf(profile)).isEqualTo("_PDFA-2b.pdf");
        }

        @Test
        @DisplayName("'pdfa-1' resolves to PDF/A-1b")
        void pdfa1Resolves() throws Exception {
            assertThat(partOf(resolveProfile("pdfa-1"))).isEqualTo(1);
            assertThat(suffixOf(resolveProfile("pdfa-1"))).isEqualTo("_PDFA-1b.pdf");
        }

        @Test
        @DisplayName("'pdfa' and 'pdfa-2b' resolve to PDF/A-2b")
        void pdfa2Resolves() throws Exception {
            assertThat(partOf(resolveProfile("pdfa"))).isEqualTo(2);
            assertThat(partOf(resolveProfile("pdfa-2b"))).isEqualTo(2);
        }

        @Test
        @DisplayName("'pdfa-3' and 'pdfa-3b' resolve to PDF/A-3b")
        void pdfa3Resolves() throws Exception {
            assertThat(partOf(resolveProfile("pdfa-3"))).isEqualTo(3);
            assertThat(partOf(resolveProfile("pdfa-3b"))).isEqualTo(3);
            assertThat(suffixOf(resolveProfile("pdfa-3"))).isEqualTo("_PDFA-3b.pdf");
        }

        @Test
        @DisplayName("token is trimmed and case-insensitive")
        void caseInsensitiveAndTrimmed() throws Exception {
            assertThat(partOf(resolveProfile("  PDFA-1  "))).isEqualTo(1);
            assertThat(partOf(resolveProfile("PDFA-3B"))).isEqualTo(3);
        }

        @Test
        @DisplayName("unknown token falls back to PDF/A-2b")
        void unknownFallsBack() throws Exception {
            assertThat(partOf(resolveProfile("not-a-real-format"))).isEqualTo(2);
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("PdfXProfile.fromRequest token resolution")
    class PdfXProfileResolution {

        private Object resolveProfile(String token) throws Exception {
            Class<?> enumClass = null;
            for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
                if (inner.getSimpleName().equals("PdfXProfile")) {
                    enumClass = inner;
                }
            }
            assertThat(enumClass).isNotNull();
            Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
            m.setAccessible(true);
            return m.invoke(null, token);
        }

        private String suffixOf(Object profile) throws Exception {
            Method m = profile.getClass().getDeclaredMethod("outputSuffix");
            m.setAccessible(true);
            return (String) m.invoke(profile);
        }

        @Test
        @DisplayName("null token defaults to PDF/X")
        void nullDefaultsToPdfX() throws Exception {
            assertThat(suffixOf(resolveProfile(null))).isEqualTo("_PDFX.pdf");
        }

        @Test
        @DisplayName("'pdfx' resolves to the PDF/X profile")
        void pdfxResolves() throws Exception {
            assertThat(suffixOf(resolveProfile("pdfx"))).isEqualTo("_PDFX.pdf");
        }

        @Test
        @DisplayName("unknown token falls back to PDF/X")
        void unknownFallsBack() throws Exception {
            assertThat(suffixOf(resolveProfile("garbage"))).isEqualTo("_PDFX.pdf");
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("detectMimeTypeFromFilename")
    class MimeTypeDetection {

        private String detect(String fileName) throws Exception {
            return invokeInstance(newController(), "detectMimeTypeFromFilename", fileName);
        }

        @Test
        @DisplayName("known extensions map to their MIME type")
        void knownExtensions() throws Exception {
            assertThat(detect("data.xml")).isEqualTo("application/xml");
            assertThat(detect("data.json")).isEqualTo("application/json");
            assertThat(detect("notes.txt")).isEqualTo("text/plain");
            assertThat(detect("image.png")).isEqualTo("image/png");
            assertThat(detect("photo.JPEG")).isEqualTo("image/jpeg");
            assertThat(detect("archive.zip")).isEqualTo("application/zip");
        }

        @Test
        @DisplayName("unknown extension yields octet-stream default")
        void unknownExtension() throws Exception {
            assertThat(detect("file.unknownext")).isEqualTo("application/octet-stream");
        }

        @Test
        @DisplayName("null and empty file names yield octet-stream default")
        void nullAndEmpty() throws Exception {
            assertThat(detect(null)).isEqualTo("application/octet-stream");
            assertThat(detect("")).isEqualTo("application/octet-stream");
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("countGlyphs / buildStandardType1GlyphSet")
    class GlyphHelpers {

        @Test
        @DisplayName("countGlyphs counts forward slashes")
        void countsSlashes() throws Exception {
            assertThat((int) invokeStatic("countGlyphs", "/a/b/c")).isEqualTo(3);
            assertThat((int) invokeStatic("countGlyphs", "no-slashes")).isEqualTo(0);
        }

        @Test
        @DisplayName("countGlyphs handles null and empty")
        void countsNullEmpty() throws Exception {
            assertThat((int) invokeStatic("countGlyphs", (Object) null)).isEqualTo(0);
            assertThat((int) invokeStatic("countGlyphs", "")).isEqualTo(0);
        }

        @Test
        @DisplayName("standard glyph set is space-separated and contains core glyphs")
        void standardGlyphSet() throws Exception {
            String glyphs = invokeStatic("buildStandardType1GlyphSet");
            assertThat(glyphs).isNotBlank();
            assertThat(glyphs).contains(".notdef", "space", "A", "z", "zero", "period");
            // space-separated; no leading slash format here
            assertThat(glyphs.split(" ").length).isGreaterThan(100);
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("isType1Font / quad and rect validation")
    class TypeAndGeometryHelpers {

        @Test
        @DisplayName("isType1Font true for Standard14 Type1 font")
        void isType1True() throws Exception {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            assertThat((boolean) invokeStatic("isType1Font", font)).isTrue();
        }

        @Test
        @DisplayName("isValidQuadPoints accepts multiples of 8, rejects otherwise")
        void quadValidation() throws Exception {
            ConvertPDFToPDFA controller = newController();
            assertThat(
                            (boolean)
                                    invokeInstance(
                                            controller, "isValidQuadPoints", (Object) new float[8]))
                    .isTrue();
            assertThat(
                            (boolean)
                                    invokeInstance(
                                            controller,
                                            "isValidQuadPoints",
                                            (Object) new float[16]))
                    .isTrue();
            assertThat(
                            (boolean)
                                    invokeInstance(
                                            controller, "isValidQuadPoints", (Object) new float[5]))
                    .isFalse();
            assertThat((boolean) invokeInstance(controller, "isValidQuadPoints", (Object) null))
                    .isFalse();
        }

        @Test
        @DisplayName("isZeroSizeRect distinguishes collapsed and real rectangles")
        void zeroSizeRect() throws Exception {
            ConvertPDFToPDFA controller = newController();
            PDRectangle zero = new PDRectangle(10f, 10f, 0f, 0f);
            PDRectangle real = new PDRectangle(0f, 0f, 100f, 50f);
            assertThat((boolean) invokeInstance(controller, "isZeroSizeRect", zero)).isTrue();
            assertThat((boolean) invokeInstance(controller, "isZeroSizeRect", real)).isFalse();
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("findUnembeddedFontNames")
    class UnembeddedFontDetection {

        @Test
        @DisplayName("standard 14 fonts (not embedded) are reported as missing")
        void detectsStandardFontAsUnembedded() throws Exception {
            try (PDDocument document = simplePdf()) {
                Set<String> missing = invokeStatic("findUnembeddedFontNames", document);
                assertThat(missing).isNotNull();
                assertThat(missing).anyMatch(name -> name.contains("Helvetica"));
            }
        }

        @Test
        @DisplayName("page with no resources reports no missing fonts")
        void pageWithoutResources() throws Exception {
            try (PDDocument document = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                page.setResources(new PDResources());
                document.addPage(page);
                Set<String> missing = invokeStatic("findUnembeddedFontNames", document);
                assertThat(missing).isEmpty();
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("detectTransparentXObjects")
    class TransparentXObjectDetection {

        @Test
        @DisplayName("page with no resources returns empty set")
        void noResources() throws Exception {
            PDPage page = new PDPage(PDRectangle.A4);
            Set<COSName> result = invokeStatic("detectTransparentXObjects", page);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("page with empty resources returns empty set")
        void emptyResources() throws Exception {
            PDPage page = new PDPage(PDRectangle.A4);
            page.setResources(new PDResources());
            Set<COSName> result = invokeStatic("detectTransparentXObjects", page);
            assertThat(result).isEmpty();
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("sanitizePdfA part-specific behaviour")
    class SanitizePdfAExtras {

        @Test
        @DisplayName("PDF/A-3 preserves embedded-file structures (FILESPEC type)")
        void pdfA3PreservesFilespec() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setItem(COSName.TYPE, COSName.FILESPEC);
            dict.setItem(COSName.EF, new COSDictionary());
            dict.setItem(COSName.URI, COSName.A);

            invokeStatic("sanitizePdfA", dict, 3);

            // For part 3, filespec dictionaries are skipped entirely, so URI survives.
            assertThat(dict.containsKey(COSName.EF)).isTrue();
            assertThat(dict.containsKey(COSName.URI)).isTrue();
        }

        @Test
        @DisplayName("PDF/A-3 keeps URI on a normal dictionary but still strips JavaScript")
        void pdfA3KeepsUriStripsJs() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setString(COSName.URI, "http://example.com");
            dict.setString(COSName.JAVA_SCRIPT, "app.alert('x');");

            invokeStatic("sanitizePdfA", dict, 3);

            assertThat(dict.containsKey(COSName.URI)).isTrue();
            assertThat(dict.containsKey(COSName.JAVA_SCRIPT)).isFalse();
        }

        @Test
        @DisplayName("recurses into nested arrays and dictionaries")
        void recursesIntoNested() throws Exception {
            COSDictionary child = new COSDictionary();
            child.setString(COSName.JAVA_SCRIPT, "code");
            COSArray array = new COSArray();
            array.add(child);
            COSDictionary parent = new COSDictionary();
            parent.setItem(COSName.getPDFName("Kids"), array);

            invokeStatic("sanitizePdfA", parent, 2);

            assertThat(child.containsKey(COSName.JAVA_SCRIPT)).isFalse();
        }

        @Test
        @DisplayName("PDF/A-2 does NOT remove SMask/CA (those are only stripped for part 1)")
        void pdfA2KeepsTransparencyEntries() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setItem(COSName.SMASK, new COSArray());
            dict.setFloat(COSName.CA, 0.5f);

            invokeStatic("sanitizePdfA", dict, 2);

            assertThat(dict.containsKey(COSName.SMASK)).isTrue();
            assertThat(dict.containsKey(COSName.CA)).isTrue();
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("sanitizeMetadata / removeForbiddenActions")
    class MetadataAndActions {

        @Test
        @DisplayName("sanitizeMetadata strips non-printable chars and sets producer")
        void sanitizeMetadataCleans() throws Exception {
            try (PDDocument document = simplePdf()) {
                PDDocumentInformation info = new PDDocumentInformation();
                info.setCustomMetadataValue("Custom", "cleanvalue");
                document.setDocumentInformation(info);

                invokeInstance(newController(), "sanitizeMetadata", document);

                PDDocumentInformation result = document.getDocumentInformation();
                assertThat(result.getProducer()).isEqualTo("Stirling-PDF Sanitizer");
                assertThat(result.getCustomMetadataValue("Custom")).isEqualTo("cleanvalue");
            }
        }

        @Test
        @DisplayName("sanitizeMetadata always overwrites producer to the sanitizer marker")
        void sanitizeMetadataOverwritesProducer() throws Exception {
            try (PDDocument document = simplePdf()) {
                PDDocumentInformation info = new PDDocumentInformation();
                info.setProducer("Some Other Producer");
                document.setDocumentInformation(info);

                invokeInstance(newController(), "sanitizeMetadata", document);

                assertThat(document.getDocumentInformation().getProducer())
                        .isEqualTo("Stirling-PDF Sanitizer");
            }
        }

        @Test
        @DisplayName("removeForbiddenActions clears open action and JavaScript")
        void removeForbiddenActions() throws Exception {
            try (PDDocument document = simplePdf()) {
                PDDocumentCatalog catalog = document.getDocumentCatalog();
                catalog.getCOSObject().setItem(COSName.JAVA_SCRIPT, new COSDictionary());

                invokeInstance(newController(), "removeForbiddenActions", document);

                assertThat(catalog.getCOSObject().containsKey(COSName.JAVA_SCRIPT)).isFalse();
                assertThat(catalog.getOpenAction()).isNull();
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("fixOptionalContentGroups")
    class OptionalContentGroups {

        @Test
        @DisplayName("no OCProperties is a no-op (does not throw)")
        void noOcProperties() throws Exception {
            try (PDDocument document = simplePdf()) {
                assertThatCode(() -> invokeStatic("fixOptionalContentGroups", document))
                        .doesNotThrowAnyException();
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("addWhiteBackground")
    class WhiteBackground {

        @Test
        @DisplayName("adds a prepended content stream without changing page count")
        void addsBackground() throws Exception {
            try (PDDocument document = simplePdf()) {
                int pagesBefore = document.getNumberOfPages();
                assertThatCode(
                                () ->
                                        invokeInstance(
                                                newController(), "addWhiteBackground", document))
                        .doesNotThrowAnyException();
                assertThat(document.getNumberOfPages()).isEqualTo(pagesBefore);
                // page still has content streams after prepending background
                assertThat(document.getPage(0).hasContents()).isTrue();
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("ensureAnnotationAppearances")
    class AnnotationAppearances {

        @Test
        @DisplayName("Link annotations are skipped (kept) by appearance enforcement")
        void linkAnnotationsKept() throws Exception {
            try (PDDocument document = simplePdf()) {
                PDPage page = document.getPage(0);
                PDAnnotationLink link = new PDAnnotationLink();
                link.setRectangle(new PDRectangle(0, 0, 50, 50));
                List<PDAnnotation> annotations = new ArrayList<>();
                annotations.add(link);
                page.setAnnotations(annotations);

                invokeInstance(newController(), "ensureAnnotationAppearances", document);

                assertThat(page.getAnnotations()).hasSize(1);
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("ensureEmbeddedFileCompliance / addICCProfileIfNotPresent")
    class EmbeddedAndIcc {

        @Test
        @DisplayName("ensureEmbeddedFileCompliance returns quietly with no names dictionary")
        void noNamesDictionary() throws Exception {
            try (PDDocument document = simplePdf()) {
                assertThatCode(
                                () ->
                                        invokeInstance(
                                                newController(),
                                                "ensureEmbeddedFileCompliance",
                                                document))
                        .doesNotThrowAnyException();
            }
        }

        @Test
        @DisplayName("addICCProfileIfNotPresent adds an sRGB output intent")
        void addsIccOutputIntent() throws Exception {
            try (PDDocument document = simplePdf()) {
                assertThat(document.getDocumentCatalog().getOutputIntents()).isEmpty();

                invokeInstance(newController(), "addICCProfileIfNotPresent", document);

                assertThat(document.getDocumentCatalog().getOutputIntents()).hasSize(1);
                assertThat(document.getDocumentCatalog().getOutputIntents().get(0).getInfo())
                        .contains("sRGB");
            }
        }

        @Test
        @DisplayName("addICCProfileIfNotPresent does not add a second intent when one exists")
        void doesNotDuplicateIntent() throws Exception {
            try (PDDocument document = simplePdf()) {
                invokeInstance(newController(), "addICCProfileIfNotPresent", document);
                invokeInstance(newController(), "addICCProfileIfNotPresent", document);
                assertThat(document.getDocumentCatalog().getOutputIntents()).hasSize(1);
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("performBasicPdfAValidation / buildComprehensiveValidationMessage")
    class ValidationHelpers {

        @Test
        @DisplayName("basic validation flags missing XMP and output intent for a plain PDF")
        void basicValidationFlagsMissing() throws Exception {
            Path pdf = tempDir.resolve("plain.pdf");
            Files.write(pdf, simplePdfBytes());

            // PdfaProfile.PDF_A_2B has no preflight format -> basic validation path.
            Object profile = resolvePdfaProfile("pdfa-2b");
            org.apache.pdfbox.preflight.ValidationResult result =
                    invokeStaticWithTypes(
                            "performBasicPdfAValidation",
                            new Class<?>[] {Path.class, profile.getClass()},
                            pdf,
                            profile);

            assertThat(result).isNotNull();
            assertThat(result.isValid()).isFalse();
            assertThat(result.getErrorsList()).isNotEmpty();
        }

        @Test
        @DisplayName("comprehensive message summarises error count and codes")
        void comprehensiveMessage() throws Exception {
            Object profile = resolvePdfaProfile("pdfa-1");
            org.apache.pdfbox.preflight.ValidationResult result =
                    new org.apache.pdfbox.preflight.ValidationResult(false);
            result.addError(
                    new org.apache.pdfbox.preflight.ValidationResult.ValidationError(
                            "CODE_A", "first problem"));
            result.addError(
                    new org.apache.pdfbox.preflight.ValidationResult.ValidationError(
                            "CODE_B", "second problem"));

            String message =
                    invokeStaticWithTypes(
                            "buildComprehensiveValidationMessage",
                            new Class<?>[] {
                                org.apache.pdfbox.preflight.ValidationResult.class,
                                profile.getClass()
                            },
                            result,
                            profile);

            assertThat(message).contains("PDF/A-1b");
            assertThat(message).contains("2 errors");
            assertThat(message).contains("CODE_A");
        }

        // helper: resolve enum constant + call typed static method
        private Object resolvePdfaProfile(String token) throws Exception {
            Class<?> enumClass = null;
            for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
                if (inner.getSimpleName().equals("PdfaProfile")) {
                    enumClass = inner;
                }
            }
            Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
            m.setAccessible(true);
            return m.invoke(null, token);
        }

        @SuppressWarnings("unchecked")
        private <T> T invokeStaticWithTypes(String name, Class<?>[] types, Object... args)
                throws Exception {
            Method m = ConvertPDFToPDFA.class.getDeclaredMethod(name, types);
            m.setAccessible(true);
            try {
                return (T) m.invoke(null, args);
            } catch (InvocationTargetException e) {
                throw unwrap(e);
            }
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("verifyStrictCompliance (VeraPDFService mocked)")
    class StrictCompliance {

        @Test
        @DisplayName("compliant result passes without throwing")
        void compliantPasses() throws Exception {
            PDFVerificationResult ok = new PDFVerificationResult();
            ok.setCompliant(true);
            ok.setStandard("1b");
            ok.setComplianceSummary("PDF/A-1b compliant");
            when(veraPDFService.validatePDF(any())).thenReturn(List.of(ok));

            ConvertPDFToPDFA controller = newController();
            assertThatCode(
                            () ->
                                    invokeInstance(
                                            controller,
                                            "verifyStrictCompliance",
                                            (Object) "dummy".getBytes()))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("non-compliant result throws 400 ResponseStatusException with details")
        void nonCompliantThrowsBadRequest() throws Exception {
            PDFVerificationResult bad = new PDFVerificationResult();
            bad.setCompliant(false);
            bad.setStandard("1b");
            bad.setComplianceSummary("PDF/A-1b with errors");
            when(veraPDFService.validatePDF(any())).thenReturn(List.of(bad));

            ConvertPDFToPDFA controller = newController();
            ResponseStatusException ex =
                    (ResponseStatusException)
                            catchThrowable(
                                    () ->
                                            invokeInstance(
                                                    controller,
                                                    "verifyStrictCompliance",
                                                    (Object) "dummy".getBytes()));
            assertThat(ex).isNotNull();
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(ex.getReason()).contains("PDF/A-1b with errors");
        }

        @Test
        @DisplayName("empty result list is treated as non-compliant -> 400")
        void emptyResultsTreatedNonCompliant() throws Exception {
            when(veraPDFService.validatePDF(any())).thenReturn(Collections.emptyList());

            ConvertPDFToPDFA controller = newController();
            ResponseStatusException ex =
                    (ResponseStatusException)
                            catchThrowable(
                                    () ->
                                            invokeInstance(
                                                    controller,
                                                    "verifyStrictCompliance",
                                                    (Object) "dummy".getBytes()));
            assertThat(ex).isNotNull();
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("service error is wrapped as 500 ResponseStatusException")
        void serviceErrorWrappedAs500() throws Exception {
            when(veraPDFService.validatePDF(any())).thenThrow(new IOException("boom"));

            ConvertPDFToPDFA controller = newController();
            ResponseStatusException ex =
                    (ResponseStatusException)
                            catchThrowable(
                                    () ->
                                            invokeInstance(
                                                    controller,
                                                    "verifyStrictCompliance",
                                                    (Object) "dummy".getBytes()));
            assertThat(ex).isNotNull();
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("pdfToPdfA controller validation branch")
    class ControllerValidation {

        @Test
        @DisplayName("non-PDF content type throws PDF-required exception before any conversion")
        void nonPdfContentTypeRejected() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "input.txt",
                            MediaType.TEXT_PLAIN_VALUE,
                            "not a pdf".getBytes());
            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(file);
            request.setOutputFormat("pdfa-2b");

            ConvertPDFToPDFA controller = newController();

            assertThatThrownBy(() -> controller.pdfToPdfA(request))
                    .isInstanceOf(IllegalArgumentException.class);

            // collaborators must not be touched on the validation-failure path
            verifyNoInteractions(tempFileManager, veraPDFService);
        }

        @Test
        @DisplayName("null content type is also rejected as not-a-PDF")
        void nullContentTypeRejected() {
            MockMultipartFile file =
                    new MockMultipartFile("fileInput", "input.bin", null, "data".getBytes());
            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(file);
            request.setOutputFormat("pdfa");

            ConvertPDFToPDFA controller = newController();

            assertThatThrownBy(() -> controller.pdfToPdfA(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // =======================================================================================
    @Nested
    @DisplayName("ensureEmbeddedFilesAFRelationship / isTransparencyGroup")
    class StaticEdgeCases {

        @Test
        @DisplayName("ensureEmbeddedFilesAFRelationship is a no-op when no names dictionary")
        void afRelationshipNoNames() throws Exception {
            try (PDDocument document = simplePdf()) {
                assertThatCode(() -> invokeStatic("ensureEmbeddedFilesAFRelationship", document))
                        .doesNotThrowAnyException();
            }
        }

        @Test
        @DisplayName("isTransparencyGroup true only for /S /Transparency group dictionaries")
        void transparencyGroup() throws Exception {
            COSDictionary withGroup = new COSDictionary();
            COSDictionary groupDict = new COSDictionary();
            groupDict.setItem(COSName.S, COSName.TRANSPARENCY);
            withGroup.setItem(COSName.GROUP, groupDict);
            assertThat((boolean) invokeStatic("isTransparencyGroup", withGroup)).isTrue();

            COSDictionary withoutGroup = new COSDictionary();
            assertThat((boolean) invokeStatic("isTransparencyGroup", withoutGroup)).isFalse();
        }
    }
}
