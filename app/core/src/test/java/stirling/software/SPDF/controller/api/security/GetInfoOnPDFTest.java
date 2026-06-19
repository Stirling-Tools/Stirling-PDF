package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.GregorianCalendar;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.ProtectionPolicy;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionLaunch;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("GetInfoOnPDF Controller Tests")
@ExtendWith(MockitoExtension.class)
class GetInfoOnPDFTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private VeraPDFService veraPDFService;

    @InjectMocks private GetInfoOnPDF getInfoOnPDF;

    private ObjectMapper objectMapper;

    private static final java.time.ZonedDateTime FIXED_NOW =
            java.time.ZonedDateTime.parse("2020-01-01T00:00:00Z");

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
    }

    /** Helper method to load PDF bytes from test resources */
    private byte[] loadPdfBytesFromResources(String filename) throws IOException {
        ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
        if (classLoader == null) {
            classLoader = getClass().getClassLoader();
        }

        if (classLoader != null) {
            try (InputStream resourceStream = classLoader.getResourceAsStream(filename)) {
                if (resourceStream != null) {
                    return resourceStream.readAllBytes();
                }
            }
        }

        Path projectRoot = locateProjectRoot(Path.of("").toAbsolutePath());
        List<Path> searchDirectories =
                List.of(
                        projectRoot.resolve(
                                Path.of("app", "core", "src", "test", "resources").toString()),
                        projectRoot.resolve(
                                Path.of("app", "common", "src", "test", "resources").toString()),
                        projectRoot.resolve(
                                Path.of("testing", "cucumber", "exampleFiles").toString()));

        for (Path directory : searchDirectories) {
            Path filePath = directory.resolve(filename);
            if (Files.exists(filePath)) {
                return Files.readAllBytes(filePath);
            }
        }

        throw new IOException("PDF file not found: " + filename);
    }

    private Path locateProjectRoot(Path start) {
        Path current = start;
        while (current != null) {
            if (Files.exists(current.resolve("settings.gradle"))) {
                return current;
            }
            current = current.getParent();
        }
        return start;
    }

    /** Helper method to create a simple PDF document with text */
    private PDDocument createSimplePdfWithText(String text) throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
            contentStream.beginText();
            contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            contentStream.newLineAtOffset(100, 700);
            contentStream.showText(text);
            contentStream.endText();
        }

        return document;
    }

    /** Helper method to create a PDF with metadata */
    private PDDocument createPdfWithMetadata() throws IOException {
        PDDocument document = createSimplePdfWithText("Test document with metadata");

        PDDocumentInformation info = new PDDocumentInformation();
        info.setTitle("Test Title");
        info.setAuthor("Test Author");
        info.setSubject("Test Subject");
        info.setKeywords("test, pdf, metadata");
        info.setCreator("Test Creator");
        info.setProducer("Test Producer");

        GregorianCalendar cal = GregorianCalendar.from(FIXED_NOW);
        info.setCreationDate(cal);
        info.setModificationDate(cal);

        document.setDocumentInformation(info);
        return document;
    }

    /** Helper method to create an encrypted PDF */
    private PDDocument createEncryptedPdf() throws IOException {
        PDDocument document = createSimplePdfWithText("Encrypted content");

        AccessPermission accessPermission = new AccessPermission();
        accessPermission.setCanPrint(false);
        accessPermission.setCanModify(false);

        ProtectionPolicy protectionPolicy =
                new StandardProtectionPolicy("owner", "user", accessPermission);
        document.protect(protectionPolicy);

        return document;
    }

    /** Helper method to serialize a PDDocument to bytes (and close it). */
    private byte[] documentToBytes(PDDocument document) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();
        return baos.toByteArray();
    }

    /** Helper method to build a FileUpload PDF part from raw bytes. */
    private FileUpload pdfUpload(byte[] bytes, String filename) {
        return TestFileUploads.of(bytes, filename, "application/pdf");
    }

    @Nested
    @DisplayName("Basic Functionality Tests")
    class BasicFunctionalityTests {

        @Test
        @DisplayName("Should successfully extract info from a valid PDF")
        void testGetPdfInfo_ValidPdf() throws IOException {
            byte[] pdfBytes = documentToBytes(createPdfWithMetadata());
            FileUpload upload = pdfUpload(pdfBytes, "test.pdf");

            try (PDDocument loadedDoc = Loader.loadPDF(pdfBytes)) {
                Mockito.when(
                                pdfDocumentFactory.load(
                                        ArgumentMatchers.any(MultipartFile.class),
                                        ArgumentMatchers.anyBoolean()))
                        .thenReturn(loadedDoc);

                Response response = getInfoOnPDF.getPdfInfo(upload, null);

                Assertions.assertNotNull(response);
                Assertions.assertEquals(200, response.getStatus());
                Assertions.assertNotNull(response.getEntity());

                String jsonResponse =
                        new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
                JsonNode jsonNode = objectMapper.readTree(jsonResponse);

                Assertions.assertTrue(jsonNode.has("Metadata"));
                Assertions.assertTrue(jsonNode.has("BasicInfo"));
                Assertions.assertTrue(jsonNode.has("DocumentInfo"));
                Assertions.assertTrue(jsonNode.has("Compliancy"));
                Assertions.assertTrue(jsonNode.has("Encryption"));
                Assertions.assertTrue(jsonNode.has("Permissions"));

                JsonNode metadata = jsonNode.get("Metadata");
                Assertions.assertEquals("Test Title", metadata.get("Title").asText(""));
                Assertions.assertEquals("Test Author", metadata.get("Author").asText(""));
            }
        }

        @Test
        @DisplayName("Should extract basic info correctly")
        void testGetPdfInfo_BasicInfo() throws IOException {
            byte[] pdfBytes =
                    documentToBytes(createSimplePdfWithText("Test content with some words"));
            FileUpload upload = pdfUpload(pdfBytes, "basic.pdf");

            try (PDDocument loadedDoc = Loader.loadPDF(pdfBytes)) {
                Mockito.when(
                                pdfDocumentFactory.load(
                                        ArgumentMatchers.any(MultipartFile.class),
                                        ArgumentMatchers.anyBoolean()))
                        .thenReturn(loadedDoc);

                Response response = getInfoOnPDF.getPdfInfo(upload, null);

                String jsonResponse =
                        new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
                JsonNode jsonNode = objectMapper.readTree(jsonResponse);
                JsonNode basicInfo = jsonNode.get("BasicInfo");

                Assertions.assertTrue(basicInfo.has("Number of pages"));
                Assertions.assertTrue(basicInfo.has("FileSizeInBytes"));
                Assertions.assertTrue(basicInfo.has("WordCount"));
                Assertions.assertTrue(basicInfo.has("CharacterCount"));

                Assertions.assertEquals(1, basicInfo.get("Number of pages").asInt());
                Assertions.assertTrue(basicInfo.get("FileSizeInBytes").asLong() > 0);
            }
        }

        @Test
        @DisplayName("Should handle PDF with multiple pages")
        void testGetPdfInfo_MultiplePages() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.A4));
            document.addPage(new PDPage(PDRectangle.A4));
            document.addPage(new PDPage(PDRectangle.LETTER));

            byte[] pdfBytes = documentToBytes(document);
            FileUpload upload = pdfUpload(pdfBytes, "multipage.pdf");

            try (PDDocument loadedDoc = Loader.loadPDF(pdfBytes)) {
                Mockito.when(
                                pdfDocumentFactory.load(
                                        ArgumentMatchers.any(MultipartFile.class),
                                        ArgumentMatchers.anyBoolean()))
                        .thenReturn(loadedDoc);

                Response response = getInfoOnPDF.getPdfInfo(upload, null);

                String jsonResponse =
                        new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
                JsonNode jsonNode = objectMapper.readTree(jsonResponse);

                Assertions.assertEquals(
                        3, jsonNode.get("BasicInfo").get("Number of pages").asInt());
                Assertions.assertTrue(jsonNode.has("PerPageInfo"));

                JsonNode perPageInfo = jsonNode.get("PerPageInfo");
                Assertions.assertTrue(perPageInfo.has("Page 1"));
                Assertions.assertTrue(perPageInfo.has("Page 2"));
                Assertions.assertTrue(perPageInfo.has("Page 3"));
            }
        }
    }

    @Nested
    @DisplayName("Metadata Extraction Tests")
    class MetadataExtractionTests {

        @Test
        @DisplayName("Should extract all metadata fields")
        void testExtractMetadata_AllFields() throws IOException {
            byte[] pdfBytes = documentToBytes(createPdfWithMetadata());
            FileUpload upload = pdfUpload(pdfBytes, "metadata.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode metadata = jsonNode.get("Metadata");

            Assertions.assertEquals("Test Title", metadata.get("Title").asText(""));
            Assertions.assertEquals("Test Author", metadata.get("Author").asText(""));
            Assertions.assertEquals("Test Subject", metadata.get("Subject").asText(""));
            Assertions.assertEquals("test, pdf, metadata", metadata.get("Keywords").asText(""));
            Assertions.assertEquals("Test Creator", metadata.get("Creator").asText(""));
            Assertions.assertEquals("Test Producer", metadata.get("Producer").asText(""));
            Assertions.assertTrue(metadata.has("CreationDate"));
            Assertions.assertTrue(metadata.has("ModificationDate"));

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should handle PDF with missing metadata")
        void testExtractMetadata_MissingFields() throws IOException {
            byte[] pdfBytes = documentToBytes(createSimplePdfWithText("No metadata"));
            FileUpload upload = pdfUpload(pdfBytes, "no-metadata.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            Assertions.assertNotNull(response);
            Assertions.assertEquals(200, response.getStatus());

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode metadata = jsonNode.get("Metadata");

            Assertions.assertNotNull(metadata);

            loadedDoc.close();
        }
    }

    @Nested
    @DisplayName("Encryption and Permissions Tests")
    class EncryptionPermissionsTests {

        @Test
        @DisplayName("Should detect unencrypted PDF")
        void testEncryption_UnencryptedPdf() throws IOException {
            byte[] pdfBytes = documentToBytes(createSimplePdfWithText("Not encrypted"));
            FileUpload upload = pdfUpload(pdfBytes, "unencrypted.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode encryption = jsonNode.get("Encryption");

            Assertions.assertFalse(encryption.get("IsEncrypted").asBoolean());

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should extract all permissions")
        void testPermissions_AllPermissions() throws IOException {
            byte[] pdfBytes = documentToBytes(createSimplePdfWithText("Test permissions"));
            FileUpload upload = pdfUpload(pdfBytes, "permissions.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode permissions = jsonNode.get("Permissions");

            Assertions.assertTrue(permissions.has("Document Assembly"));
            Assertions.assertTrue(permissions.has("Extracting Content"));
            Assertions.assertTrue(permissions.has("Form Filling"));
            Assertions.assertTrue(permissions.has("Modifying"));
            Assertions.assertTrue(permissions.has("Printing"));

            loadedDoc.close();
        }
    }

    @Nested
    @DisplayName("Form Fields Tests")
    class FormFieldsTests {

        @Test
        @DisplayName("Should extract form fields section from PDF")
        void testFormFields_Structure() throws IOException {
            byte[] pdfBytes =
                    documentToBytes(
                            createSimplePdfWithText("Document to test form fields section"));
            FileUpload upload = pdfUpload(pdfBytes, "test-forms.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("FormFields"));
            JsonNode formFields = jsonNode.get("FormFields");
            Assertions.assertNotNull(formFields);

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should handle PDF without form fields")
        void testFormFields_NoFields() throws IOException {
            byte[] pdfBytes = documentToBytes(createSimplePdfWithText("No form fields"));
            FileUpload upload = pdfUpload(pdfBytes, "no-forms.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode formFields = jsonNode.get("FormFields");

            Assertions.assertEquals(0, formFields.size());

            loadedDoc.close();
        }
    }

    @Nested
    @DisplayName("Per-Page Information Tests")
    class PerPageInfoTests {

        @Test
        @DisplayName("Should extract page dimensions")
        void testPerPageInfo_Dimensions() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.A4));
            document.addPage(new PDPage(PDRectangle.LETTER));

            byte[] pdfBytes = documentToBytes(document);
            FileUpload upload = pdfUpload(pdfBytes, "dimensions.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode perPageInfo = jsonNode.get("PerPageInfo");

            JsonNode page1 = perPageInfo.get("Page 1");
            Assertions.assertTrue(page1.has("Size"));
            Assertions.assertTrue(page1.get("Size").has("Standard Page"));
            Assertions.assertEquals("A4", page1.get("Size").get("Standard Page").asText(""));

            JsonNode page2 = perPageInfo.get("Page 2");
            Assertions.assertEquals("Letter", page2.get("Size").get("Standard Page").asText(""));

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should extract page rotation")
        void testPerPageInfo_Rotation() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            page.setRotation(90);
            document.addPage(page);

            byte[] pdfBytes = documentToBytes(document);
            FileUpload upload = pdfUpload(pdfBytes, "rotated.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode page1 = jsonNode.get("PerPageInfo").get("Page 1");

            Assertions.assertEquals(90, page1.get("Rotation").asInt());

            loadedDoc.close();
        }
    }

    @Nested
    @DisplayName("Validation and Error Handling Tests")
    class ValidationErrorTests {

        @Test
        @DisplayName("Should reject null file")
        void testValidation_NullFile() throws IOException {
            Response response = getInfoOnPDF.getPdfInfo(null, null);

            Assertions.assertEquals(200, response.getStatus()); // Returns error JSON with 200
            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("error"));
            Assertions.assertTrue(
                    jsonNode.get("error").asText("").contains("PDF file is required"));
        }

        @Test
        @DisplayName("Should reject empty file")
        void testValidation_EmptyFile() throws IOException {
            FileUpload emptyFile = pdfUpload(new byte[0], "empty.pdf");

            Response response = getInfoOnPDF.getPdfInfo(emptyFile, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("error"));
        }

        @Test
        @DisplayName("Should reject file that exceeds max size")
        void testValidation_TooLargeFile() throws IOException {
            // Report 101 MB without allocating memory: a FileUpload whose size() exceeds the limit.
            FileUpload largeFile = Mockito.mock(FileUpload.class);
            Mockito.lenient().when(largeFile.fileName()).thenReturn("large.pdf");
            Mockito.lenient().when(largeFile.contentType()).thenReturn("application/pdf");
            Mockito.lenient().when(largeFile.size()).thenReturn(101L * 1024L * 1024L);

            Response response = getInfoOnPDF.getPdfInfo(largeFile, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("error"));
            Assertions.assertTrue(
                    jsonNode.get("error").asText("").contains("exceeds maximum allowed size"));
        }
    }

    @Nested
    @DisplayName("Static Helper Methods Tests")
    class HelperMethodsTests {

        @Test
        @DisplayName("Should determine page orientation correctly")
        void testGetPageOrientation() {
            Assertions.assertEquals("Landscape", GetInfoOnPDF.getPageOrientation(800, 600));
            Assertions.assertEquals("Portrait", GetInfoOnPDF.getPageOrientation(600, 800));
            Assertions.assertEquals("Square", GetInfoOnPDF.getPageOrientation(600, 600));
        }

        @ParameterizedTest
        @CsvSource({
            "612, 792, Letter",
            "595.276, 841.89, A4",
            "2383.937, 3370.394, A0",
            "100, 100, Custom"
        })
        @DisplayName("Should identify standard page sizes")
        void testGetPageSize(float width, float height, String expected) {
            Assertions.assertEquals(expected, GetInfoOnPDF.getPageSize(width, height));
        }
    }

    @Nested
    @DisplayName("Real PDF Files Tests")
    class RealPdfFilesTests {

        @Test
        @DisplayName("Should process example.pdf from test resources")
        void testRealPdf_Example() {
            try {
                byte[] pdfBytes = loadPdfBytesFromResources("example.pdf");
                FileUpload upload = pdfUpload(pdfBytes, "example.pdf");

                try (PDDocument loadedDoc = Loader.loadPDF(pdfBytes)) {
                    Mockito.when(
                                    pdfDocumentFactory.load(
                                            ArgumentMatchers.any(MultipartFile.class),
                                            ArgumentMatchers.anyBoolean()))
                            .thenReturn(loadedDoc);

                    Response response = getInfoOnPDF.getPdfInfo(upload, null);

                    Assertions.assertNotNull(response);
                    Assertions.assertEquals(200, response.getStatus());

                    String jsonResponse =
                            new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
                    JsonNode jsonNode = objectMapper.readTree(jsonResponse);

                    Assertions.assertFalse(
                            jsonNode.has("error"), "Should not have error in response");

                    Assertions.assertTrue(jsonNode.has("BasicInfo"));
                    Assertions.assertTrue(jsonNode.has("DocumentInfo"));
                    Assertions.assertTrue(jsonNode.get("DocumentInfo").has("PDF version"));
                }
            } catch (IOException e) {
                Assumptions.assumeTrue(
                        false, "Skipping test - example.pdf not found: " + e.getMessage());
            }
        }

        @Test
        @DisplayName("Should process tables.pdf")
        void testRealPdf_Tables() {
            try {
                byte[] pdfBytes = loadPdfBytesFromResources("tables.pdf");
                FileUpload upload = pdfUpload(pdfBytes, "tables.pdf");

                try (PDDocument loadedDoc = Loader.loadPDF(pdfBytes)) {
                    Mockito.when(
                                    pdfDocumentFactory.load(
                                            ArgumentMatchers.any(MultipartFile.class),
                                            ArgumentMatchers.anyBoolean()))
                            .thenReturn(loadedDoc);

                    Response response = getInfoOnPDF.getPdfInfo(upload, null);

                    Assertions.assertNotNull(response);
                    String jsonResponse =
                            new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
                    JsonNode jsonNode = objectMapper.readTree(jsonResponse);

                    Assertions.assertFalse(jsonNode.has("error"));
                    Assertions.assertTrue(jsonNode.has("BasicInfo"));
                }
            } catch (IOException e) {
                Assumptions.assumeTrue(
                        false, "Skipping test - tables.pdf not found: " + e.getMessage());
            }
        }
    }

    @Nested
    @DisplayName("Compliance Tests")
    class ComplianceTests {

        @Test
        @DisplayName("Should extract compliance info using VeraPDF")
        void testCompliance_PdfA() throws Exception {
            byte[] pdfBytes = documentToBytes(createSimplePdfWithText("Test PDF/A"));
            FileUpload upload = pdfUpload(pdfBytes, "pdfa.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            // Mock VeraPDFService
            PDFVerificationResult result = new PDFVerificationResult();
            result.setStandard("pdfa-1b");
            result.setCompliant(true);
            result.setComplianceSummary("PDF/A-1b compliant");
            Mockito.when(veraPDFService.validatePDF(ArgumentMatchers.any(InputStream.class)))
                    .thenReturn(List.of(result));

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode compliancy = jsonNode.get("Compliancy");

            Assertions.assertTrue(compliancy.has("pdfa-1b"));
            Assertions.assertTrue(compliancy.get("pdfa-1b").asBoolean());

            loadedDoc.close();
        }
    }

    @Nested
    @DisplayName("Image Statistics Tests")
    class ImageStatisticsTests {

        @Test
        @DisplayName("Should extract image statistics from PDF")
        void testImageStatistics() throws IOException {
            byte[] pdfBytes =
                    documentToBytes(createSimplePdfWithText("Document for image statistics"));
            FileUpload upload = pdfUpload(pdfBytes, "no-images.pdf");

            PDDocument loadedDoc = Loader.loadPDF(pdfBytes);
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode basicInfo = jsonNode.get("BasicInfo");

            Assertions.assertTrue(basicInfo.has("TotalImages"));
            Assertions.assertTrue(basicInfo.has("UniqueImages"));
            Assertions.assertEquals(0, basicInfo.get("TotalImages").asInt());
            Assertions.assertEquals(0, basicInfo.get("UniqueImages").asInt());

            loadedDoc.close();
        }
    }

    @Test
    @DisplayName("SEC Compliance: Clean document should pass")
    void testSecCompliance_Clean() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            checkSecCompliance(doc, true);
        }
    }

    @Test
    @DisplayName("SEC Compliance: JavaScript action should fail")
    void testSecCompliance_JavaScript() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDActionJavaScript jsAction = new PDActionJavaScript("app.alert('Hi')");
            doc.getDocumentCatalog().setOpenAction(jsAction);
            checkSecCompliance(doc, false);
        }
    }

    @Test
    @DisplayName("SEC Compliance: External URI Link should fail")
    void testSecCompliance_ExternalLink() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);

            PDAnnotationLink link = new PDAnnotationLink();
            PDActionURI action = new PDActionURI();
            action.setURI("http://google.com");
            link.setAction(action);

            page.getAnnotations().add(link);
            checkSecCompliance(doc, false);
        }
    }

    @Test
    @DisplayName("SEC Compliance: Launch Action should fail")
    void testSecCompliance_LaunchAction() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);

            PDAnnotationLink link = new PDAnnotationLink();
            PDActionLaunch action = new PDActionLaunch();
            link.setAction(action);

            page.getAnnotations().add(link);
            checkSecCompliance(doc, false);
        }
    }

    @Test
    @DisplayName("SEC Compliance: Embedded File should fail")
    void testSecCompliance_EmbeddedFile() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());

            PDComplexFileSpecification fs = new PDComplexFileSpecification();
            fs.setFile("test.txt");
            PDEmbeddedFile ef =
                    new PDEmbeddedFile(doc, new ByteArrayInputStream("test".getBytes()));
            fs.setEmbeddedFile(ef);

            PDEmbeddedFilesNameTreeNode efTree = new PDEmbeddedFilesNameTreeNode();
            efTree.setNames(Collections.singletonMap("test", fs));

            PDDocumentNameDictionary names = new PDDocumentNameDictionary(doc.getDocumentCatalog());
            names.setEmbeddedFiles(efTree);
            doc.getDocumentCatalog().setNames(names);

            checkSecCompliance(doc, false);
        }
    }

    private void checkSecCompliance(PDDocument doc, boolean expected) throws Exception {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.save(baos);
            byte[] bytes = baos.toByteArray();

            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(Loader.loadPDF(bytes));

            FileUpload upload = pdfUpload(bytes, "test.pdf");
            Response response = getInfoOnPDF.getPdfInfo(upload, null);

            String jsonResponse = new String((byte[]) response.getEntity(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            boolean actual = jsonNode.get("Compliancy").get("IsPDF/SECCompliant").asBoolean();

            Assertions.assertEquals(expected, actual, "SEC Compliance check failed");
        }
    }
}
