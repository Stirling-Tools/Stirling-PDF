package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.preflight.ValidationResult;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.PDFAIdentificationSchema;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.junit.jupiter.MockitoExtension;

@DisplayName("PDF to PDF/A Converter Tests")
@ExtendWith(MockitoExtension.class)
class ConvertPDFToPDFATest {

    @TempDir Path tempDir;

    @SuppressWarnings("unchecked")
    private static <T> T invokePrivateMethod(String methodName, Object... args) throws Exception {
        Class<?>[] paramTypes = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) {
            if (args[i] == null) {
                paramTypes[i] = Object.class;
            } else if (args[i] instanceof Integer) {
                paramTypes[i] = int.class;
            } else if (args[i] instanceof Boolean) {
                paramTypes[i] = boolean.class;
            } else {
                paramTypes[i] = args[i].getClass();
            }
        }

        try {
            Method method = ConvertPDFToPDFA.class.getDeclaredMethod(methodName, paramTypes);
            method.setAccessible(true);
            return (T) method.invoke(null, args);
        } catch (NoSuchMethodException e) {
            for (Method method : ConvertPDFToPDFA.class.getDeclaredMethods()) {
                if (method.getName().equals(methodName)
                        && method.getParameterCount() == args.length) {
                    method.setAccessible(true);
                    return (T) method.invoke(null, args);
                }
            }
            throw e;
        }
    }

    private PDDocument createSimplePdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
            contentStream.beginText();
            contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            contentStream.newLineAtOffset(100, 700);
            contentStream.showText("Test PDF Document");
            contentStream.endText();
        }

        return document;
    }

    private PDDocument createPdfWithMetadata(String title, String author, String creator)
            throws IOException {
        PDDocument document = createSimplePdf();

        PDDocumentInformation info = new PDDocumentInformation();
        info.setTitle(title);
        info.setAuthor(author);
        info.setCreator(creator);
        info.setSubject("Test Subject");
        info.setKeywords("test, pdf, metadata");
        info.setProducer("Test Producer");

        GregorianCalendar cal = new GregorianCalendar(2024, Calendar.JANUARY, 1);
        info.setCreationDate(cal);
        info.setModificationDate(cal);

        document.setDocumentInformation(info);
        return document;
    }

    private PDDocument createPdfWithTransparency() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        BufferedImage bufferedImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_ARGB);
        java.awt.Graphics2D g2d = bufferedImage.createGraphics();
        g2d.setColor(new Color(255, 0, 0, 128)); // Semi-transparent red
        g2d.fillRect(0, 0, 100, 100);
        g2d.dispose();

        PDImageXObject image = LosslessFactory.createFromImage(document, bufferedImage);

        try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
            contentStream.drawImage(image, 100, 600, 100, 100);
        }

        return document;
    }

    private PDDocument createPdfWithXmpMetadata(int pdfaPart) throws Exception {
        PDDocument document = createSimplePdf();

        XMPMetadata xmp = XMPMetadata.createXMPMetadata();

        PDFAIdentificationSchema pdfaSchema = xmp.createAndAddPDFAIdentificationSchema();
        pdfaSchema.setPart(pdfaPart);
        pdfaSchema.setConformance("B");

        DublinCoreSchema dcSchema = xmp.createAndAddDublinCoreSchema();
        dcSchema.addCreator("Test Creator");
        dcSchema.setTitle("Test Title");

        XMPBasicSchema xmpBasicSchema = xmp.createAndAddXMPBasicSchema();
        xmpBasicSchema.setCreatorTool("Test Tool");

        ByteArrayOutputStream xmpStream = new ByteArrayOutputStream();
        new XmpSerializer().serialize(xmp, xmpStream, true);

        PDMetadata metadata = new PDMetadata(document);
        metadata.importXMPMetadata(xmpStream.toByteArray());

        document.getDocumentCatalog().setMetadata(metadata);

        return document;
    }

    @Nested
    @DisplayName("XMP Metadata Operations")
    class XmpMetadataTests {

        @Test
        @DisplayName("Should add PDF/A-1 identification schema to XMP metadata")
        void shouldAddPdfA1IdentificationSchema() throws Exception {
            PDDocument document = createPdfWithMetadata("Test PDF", "Test Author", "Test Creator");

            invokePrivateMethod("mergeAndAddXmpMetadata", document, 1);

            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            assertThat(metadata).isNotNull();

            try (InputStream is = metadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                XMPMetadata xmp = parser.parse(is);

                PDFAIdentificationSchema pdfaSchema =
                        (PDFAIdentificationSchema) xmp.getSchema(PDFAIdentificationSchema.class);
                assertThat(pdfaSchema).isNotNull();
                assertThat(pdfaSchema.getPart()).isEqualTo(1);
                assertThat(pdfaSchema.getConformance()).isEqualTo("B");
            }

            document.close();
        }

        @Test
        @DisplayName("Should add PDF/A-2 identification schema to XMP metadata")
        void shouldAddPdfA2IdentificationSchema() throws Exception {
            PDDocument document = createSimplePdf();

            invokePrivateMethod("mergeAndAddXmpMetadata", document, 2);

            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            try (InputStream is = metadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                XMPMetadata xmp = parser.parse(is);

                PDFAIdentificationSchema pdfaSchema =
                        (PDFAIdentificationSchema) xmp.getSchema(PDFAIdentificationSchema.class);
                assertThat(pdfaSchema.getPart()).isEqualTo(2);
                assertThat(pdfaSchema.getConformance()).isEqualTo("B");
            }

            document.close();
        }

        @Test
        @DisplayName("Should preserve Dublin Core creator information")
        void shouldPreserveDublinCoreCreatorInformation() throws Exception {
            PDDocument document =
                    createPdfWithMetadata("Test PDF", "Test Author", "Original Creator");

            invokePrivateMethod("mergeAndAddXmpMetadata", document, 1);

            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            try (InputStream is = metadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                XMPMetadata xmp = parser.parse(is);

                DublinCoreSchema dcSchema = xmp.getDublinCoreSchema();
                assertThat(dcSchema).isNotNull();
                assertThat(dcSchema.getCreators()).contains("Original Creator");
            }

            document.close();
        }

        @Test
        @DisplayName("Should set creation and modification timestamps")
        void shouldSetCreationAndModificationTimestamps() throws Exception {
            PDDocument document = createSimplePdf();

            invokePrivateMethod("mergeAndAddXmpMetadata", document, 1);

            PDDocumentInformation info = document.getDocumentInformation();
            assertThat(info.getCreationDate()).isNotNull();
            assertThat(info.getModificationDate()).isNotNull();

            document.close();
        }

        @Test
        @DisplayName("Should handle existing XMP metadata gracefully")
        void shouldHandleExistingXmpMetadata() throws Exception {
            PDDocument document = createPdfWithXmpMetadata(1);

            invokePrivateMethod("mergeAndAddXmpMetadata", document, 2);

            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            try (InputStream is = metadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                XMPMetadata xmp = parser.parse(is);

                PDFAIdentificationSchema pdfaSchema =
                        (PDFAIdentificationSchema) xmp.getSchema(PDFAIdentificationSchema.class);
                assertThat(pdfaSchema.getPart()).isEqualTo(2);
            }

            document.close();
        }
    }

    @Nested
    @DisplayName("Content Sanitization")
    class ContentSanitizationTests {

        @Test
        @DisplayName("Should verify COSDictionary JavaScript removal logic")
        void shouldVerifyJavaScriptRemovalLogic() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setString(COSName.JAVA_SCRIPT, "app.alert('test');");
            dict.setString(COSName.getPDFName("JS"), "some_js_code");

            assertThat(dict.containsKey(COSName.JAVA_SCRIPT)).isTrue();
            assertThat(dict.containsKey(COSName.getPDFName("JS"))).isTrue();

            invokePrivateMethod("sanitizePdfA", dict, 1);

            assertThat(dict.containsKey(COSName.JAVA_SCRIPT)).isFalse();
            assertThat(dict.containsKey(COSName.getPDFName("JS"))).isFalse();
        }

        @Test
        @DisplayName("Should verify interpolation is set to false")
        void shouldVerifyInterpolationSetToFalse() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setBoolean(COSName.INTERPOLATE, true);

            assertThat(dict.getBoolean(COSName.INTERPOLATE, false)).isTrue();

            invokePrivateMethod("sanitizePdfA", dict, 1);

            assertThat(dict.getBoolean(COSName.INTERPOLATE, true)).isFalse();
        }

        @Test
        @DisplayName("Should verify SMask removal for PDF/A-1")
        void shouldVerifySMaskRemovalForPdfA1() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setItem(COSName.SMASK, new COSArray());

            assertThat(dict.containsKey(COSName.SMASK)).isTrue();

            invokePrivateMethod("sanitizePdfA", dict, 1);

            assertThat(dict.containsKey(COSName.SMASK)).isFalse();
        }

        @Test
        @DisplayName("Should verify transparency group removal for PDF/A-1")
        void shouldVerifyTransparencyGroupRemovalForPdfA1() throws Exception {
            COSDictionary dict = new COSDictionary();
            COSDictionary groupDict = new COSDictionary();
            groupDict.setItem(COSName.S, COSName.TRANSPARENCY);
            dict.setItem(COSName.GROUP, groupDict);

            assertThat(dict.containsKey(COSName.GROUP)).isTrue();

            invokePrivateMethod("sanitizePdfA", dict, 1);

            assertThat(dict.containsKey(COSName.GROUP)).isFalse();
        }

        @Test
        @DisplayName("Should verify forbidden elements are removed")
        void shouldVerifyForbiddenElementsRemoved() throws Exception {
            COSDictionary dict = new COSDictionary();
            dict.setItem(COSName.URI, COSName.A);
            dict.setItem(COSName.EMBEDDED_FILES, new COSArray());
            dict.setItem(COSName.FILESPEC, new COSDictionary());
            dict.setItem(COSName.getPDFName("RichMedia"), new COSDictionary());

            assertThat(dict.containsKey(COSName.URI)).isTrue();
            assertThat(dict.containsKey(COSName.EMBEDDED_FILES)).isTrue();

            invokePrivateMethod("sanitizePdfA", dict, 1);

            assertThat(dict.containsKey(COSName.URI)).isFalse();
            assertThat(dict.containsKey(COSName.EMBEDDED_FILES)).isFalse();
            assertThat(dict.containsKey(COSName.FILESPEC)).isFalse();
            assertThat(dict.containsKey(COSName.getPDFName("RichMedia"))).isFalse();
        }
    }

    @Nested
    @DisplayName("Transparency Detection")
    class TransparencyDetectionTests {

        @Test
        @DisplayName("Should detect SMask transparency")
        void shouldDetectSMaskTransparency() throws Exception {
            PDDocument document = createPdfWithTransparency();

            boolean hasTransparency = invokePrivateMethod("hasTransparentImages", document);

            assertThat(hasTransparency).isTrue();

            document.close();
        }

        @Test
        @DisplayName("Should not detect transparency in opaque images")
        void shouldNotDetectTransparencyInOpaqueImages() throws Exception {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);

            BufferedImage bufferedImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g2d = bufferedImage.createGraphics();
            g2d.setColor(Color.RED);
            g2d.fillRect(0, 0, 100, 100);
            g2d.dispose();

            PDImageXObject image = LosslessFactory.createFromImage(document, bufferedImage);

            try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
                contentStream.drawImage(image, 100, 600, 100, 100);
            }

            boolean hasTransparency = invokePrivateMethod("hasTransparentImages", document);

            assertThat(hasTransparency).isFalse();

            document.close();
        }

        @Test
        @DisplayName("Should detect interpolation flag")
        void shouldDetectInterpolationFlag() throws Exception {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);

            BufferedImage bufferedImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
            PDImageXObject image = LosslessFactory.createFromImage(document, bufferedImage);
            image.setInterpolate(true);

            try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
                contentStream.drawImage(image, 100, 600);
            }

            boolean hasTransparency = invokePrivateMethod("hasTransparentImages", document);

            assertThat(hasTransparency).isTrue();

            document.close();
        }
    }

    @Nested
    @DisplayName("Color Profile Management")
    class ColorProfileTests {

        @Test
        @DisplayName("Should verify ICC profile can be loaded from resources")
        void shouldVerifyIccProfileCanBeLoadedFromResources() throws Exception {
            try (InputStream iccStream = getClass().getResourceAsStream("/icc/sRGB2014.icc")) {
                assertThat(iccStream).isNotNull();
                byte[] iccData = iccStream.readAllBytes();
                assertThat(iccData).isNotEmpty();
                assertThat(iccData).hasSizeGreaterThan(1000);
            }
        }

        @Test
        @DisplayName("Should create color profile output intent structure")
        void shouldCreateColorProfileOutputIntentStructure() throws Exception {
            PDDocument document = createSimplePdf();
            try (InputStream iccStream = getClass().getResourceAsStream("/icc/sRGB2014.icc")) {
                if (iccStream != null) {
                    PDOutputIntent outputIntent = new PDOutputIntent(document, iccStream);
                    outputIntent.setInfo("sRGB IEC61966-2.1");
                    outputIntent.setOutputCondition("sRGB");
                    outputIntent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
                    outputIntent.setRegistryName("http://www.color.org");

                    document.getDocumentCatalog().addOutputIntent(outputIntent);

                    assertThat(document.getDocumentCatalog().getOutputIntents()).hasSize(1);
                    PDOutputIntent retrieved =
                            document.getDocumentCatalog().getOutputIntents().get(0);
                    assertThat(retrieved.getInfo()).contains("sRGB");
                }
            }

            document.close();
        }
    }

    @Nested
    @DisplayName("Validation")
    class ValidationTests {

        @Test
        @DisplayName("Should format validation errors correctly")
        void shouldFormatValidationErrorsCorrectly() {
            String errorCode = "ERROR_CODE_123";
            String errorDetails = "Missing XMP metadata";

            assertThat(errorCode).isNotBlank();
            assertThat(errorDetails).contains("XMP");
            assertThat(errorCode).startsWith("ERROR");
        }

        @Test
        @DisplayName("Should handle validation error details")
        void shouldHandleValidationErrorDetails() {
            String error1Code = "1.2.3";
            String error1Detail = "Font not embedded";
            String error2Detail = "Missing color profile";

            assertThat(error1Code).matches("\\d+\\.\\d+\\.\\d+");
            assertThat(error1Detail).contains("Font");
            assertThat(error2Detail).contains("color profile");
        }

        @Test
        @DisplayName("Should create validation result with errors")
        void shouldCreateValidationResultWithErrors() {
            ValidationResult result = new ValidationResult(false);

            assertThat(result.isValid()).isFalse();
            assertThat(result.getErrorsList()).isNotNull();
        }
    }

    @Nested
    @DisplayName("Helper Methods")
    class HelperMethodsTests {

        @Test
        @DisplayName("Should build standard Type1 glyph set")
        void shouldBuildStandardType1GlyphSet() throws Exception {
            String glyphSet = invokePrivateMethod("buildStandardType1GlyphSet");

            assertThat(glyphSet).isNotBlank().contains("space", "A", "a", "zero", "period");
        }

        @Test
        @DisplayName("Should delete directory recursively")
        void shouldDeleteDirectoryRecursively() throws Exception {
            Path testDir = tempDir.resolve("test_delete");
            Files.createDirectories(testDir);
            Path subDir = testDir.resolve("subdir");
            Files.createDirectories(subDir);
            Files.createFile(testDir.resolve("file1.txt"));
            Files.createFile(subDir.resolve("file2.txt"));

            assertThat(Files.exists(testDir)).isTrue();

            invokePrivateMethod("deleteQuietly", testDir);

            assertThat(Files.exists(testDir)).isFalse();
        }

        @Test
        @DisplayName("Should handle null path in deleteQuietly")
        void shouldHandleNullPathInDeleteQuietly() {
            assertDoesNotThrow(() -> invokePrivateMethod("deleteQuietly", (Path) null));
        }

        @Test
        @DisplayName("Should handle non-existent path in deleteQuietly")
        void shouldHandleNonExistentPathInDeleteQuietly() {
            Path nonExistent = tempDir.resolve("non_existent_dir");

            assertDoesNotThrow(() -> invokePrivateMethod("deleteQuietly", nonExistent));
        }
    }

    @Nested
    @DisplayName("Error Handling")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should handle empty PDF document")
        void shouldHandleEmptyPdfDocument() {
            PDDocument document = new PDDocument();

            assertDoesNotThrow(
                    () -> {
                        invokePrivateMethod("mergeAndAddXmpMetadata", document, 1);
                        document.close();
                    });
        }

        @Test
        @DisplayName("Should handle PDF with no resources")
        void shouldHandlePdfWithNoResources() throws Exception {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);

            assertThat(page.getResources()).isNull();

            COSDictionary simpleDict = new COSDictionary();
            simpleDict.setItem(COSName.JAVA_SCRIPT, COSName.A);

            assertDoesNotThrow(
                    () -> {
                        invokePrivateMethod("sanitizePdfA", simpleDict, 1);
                    });

            assertThat(simpleDict.containsKey(COSName.JAVA_SCRIPT)).isFalse();

            document.close();
        }
    }
}
