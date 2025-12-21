package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.GregorianCalendar;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.ProtectionPolicy;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("GetInfoOnPDF Controller Tests")
@ExtendWith(MockitoExtension.class)
class GetInfoOnPDFTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private GetInfoOnPDF getInfoOnPDF;

    private ObjectMapper objectMapper;

    private static final java.time.ZonedDateTime FIXED_NOW =
            java.time.ZonedDateTime.parse("2020-01-01T00:00:00Z");

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
    }

    /** Helper method to load a PDF file from test resources */
    private MockMultipartFile loadPdfFromResources(String filename) throws IOException {
        ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
        if (classLoader == null) {
            classLoader = getClass().getClassLoader();
        }

        if (classLoader != null) {
            try (InputStream resourceStream = classLoader.getResourceAsStream(filename)) {
                if (resourceStream != null) {
                    byte[] content = resourceStream.readAllBytes();
                    return new MockMultipartFile(
                            "file", filename, MediaType.APPLICATION_PDF_VALUE, content);
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
                byte[] content = Files.readAllBytes(filePath);
                return new MockMultipartFile(
                        "file", filename, MediaType.APPLICATION_PDF_VALUE, content);
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

    /** Helper method to convert PDDocument to MockMultipartFile */
    private MockMultipartFile documentToMultipartFile(PDDocument document, String filename)
            throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();
        return new MockMultipartFile(
                "file", filename, MediaType.APPLICATION_PDF_VALUE, baos.toByteArray());
    }

    @Nested
    @DisplayName("Basic Functionality Tests")
    class BasicFunctionalityTests {

        @Test
        @DisplayName("Should successfully extract info from a valid PDF")
        void testGetPdfInfo_ValidPdf() throws IOException {
            PDDocument document = createPdfWithMetadata();
            MockMultipartFile mockFile = documentToMultipartFile(document, "test.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            try (PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes())) {
                Mockito.when(
                                pdfDocumentFactory.load(
                                        ArgumentMatchers.any(MultipartFile.class),
                                        ArgumentMatchers.anyBoolean()))
                        .thenReturn(loadedDoc);

                ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

                Assertions.assertNotNull(response);
                Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
                Assertions.assertNotNull(response.getBody());

                String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
                JsonNode jsonNode = objectMapper.readTree(jsonResponse);

                Assertions.assertTrue(jsonNode.has("Metadata"));
                Assertions.assertTrue(jsonNode.has("BasicInfo"));
                Assertions.assertTrue(jsonNode.has("DocumentInfo"));
                Assertions.assertTrue(jsonNode.has("Compliancy"));
                Assertions.assertTrue(jsonNode.has("Encryption"));
                Assertions.assertTrue(jsonNode.has("Permissions"));

                JsonNode metadata = jsonNode.get("Metadata");
                Assertions.assertEquals("Test Title", metadata.get("Title").asText());
                Assertions.assertEquals("Test Author", metadata.get("Author").asText());
            }
        }

        @Test
        @DisplayName("Should extract basic info correctly")
        void testGetPdfInfo_BasicInfo() throws IOException {
            PDDocument document = createSimplePdfWithText("Test content with some words");
            MockMultipartFile mockFile = documentToMultipartFile(document, "basic.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            try (PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes())) {
                Mockito.when(
                                pdfDocumentFactory.load(
                                        ArgumentMatchers.any(MultipartFile.class),
                                        ArgumentMatchers.anyBoolean()))
                        .thenReturn(loadedDoc);

                ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

                String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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

            MockMultipartFile mockFile = documentToMultipartFile(document, "multipage.pdf");
            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            try (PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes())) {
                Mockito.when(
                                pdfDocumentFactory.load(
                                        ArgumentMatchers.any(MultipartFile.class),
                                        ArgumentMatchers.anyBoolean()))
                        .thenReturn(loadedDoc);

                ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

                String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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
            PDDocument document = createPdfWithMetadata();
            MockMultipartFile mockFile = documentToMultipartFile(document, "metadata.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode metadata = jsonNode.get("Metadata");

            Assertions.assertEquals("Test Title", metadata.get("Title").asText());
            Assertions.assertEquals("Test Author", metadata.get("Author").asText());
            Assertions.assertEquals("Test Subject", metadata.get("Subject").asText());
            Assertions.assertEquals("test, pdf, metadata", metadata.get("Keywords").asText());
            Assertions.assertEquals("Test Creator", metadata.get("Creator").asText());
            Assertions.assertEquals("Test Producer", metadata.get("Producer").asText());
            Assertions.assertTrue(metadata.has("CreationDate"));
            Assertions.assertTrue(metadata.has("ModificationDate"));

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should handle PDF with missing metadata")
        void testExtractMetadata_MissingFields() throws IOException {
            PDDocument document = createSimplePdfWithText("No metadata");
            MockMultipartFile mockFile = documentToMultipartFile(document, "no-metadata.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            Assertions.assertNotNull(response);
            Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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
            PDDocument document = createSimplePdfWithText("Not encrypted");
            MockMultipartFile mockFile = documentToMultipartFile(document, "unencrypted.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode encryption = jsonNode.get("Encryption");

            Assertions.assertFalse(encryption.get("IsEncrypted").asBoolean());

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should extract all permissions")
        void testPermissions_AllPermissions() throws IOException {
            PDDocument document = createSimplePdfWithText("Test permissions");
            MockMultipartFile mockFile = documentToMultipartFile(document, "permissions.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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
            PDDocument document = createSimplePdfWithText("Document to test form fields section");
            MockMultipartFile mockFile = documentToMultipartFile(document, "test-forms.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("FormFields"));
            JsonNode formFields = jsonNode.get("FormFields");
            Assertions.assertNotNull(formFields);

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should handle PDF without form fields")
        void testFormFields_NoFields() throws IOException {
            PDDocument document = createSimplePdfWithText("No form fields");
            MockMultipartFile mockFile = documentToMultipartFile(document, "no-forms.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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

            MockMultipartFile mockFile = documentToMultipartFile(document, "dimensions.pdf");
            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode perPageInfo = jsonNode.get("PerPageInfo");

            JsonNode page1 = perPageInfo.get("Page 1");
            Assertions.assertTrue(page1.has("Size"));
            Assertions.assertTrue(page1.get("Size").has("Standard Page"));
            Assertions.assertEquals("A4", page1.get("Size").get("Standard Page").asText());

            JsonNode page2 = perPageInfo.get("Page 2");
            Assertions.assertEquals("Letter", page2.get("Size").get("Standard Page").asText());

            loadedDoc.close();
        }

        @Test
        @DisplayName("Should extract page rotation")
        void testPerPageInfo_Rotation() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            page.setRotation(90);
            document.addPage(page);

            MockMultipartFile mockFile = documentToMultipartFile(document, "rotated.pdf");
            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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
            PDFFile request = new PDFFile();
            request.setFileInput(null);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            Assertions.assertEquals(
                    HttpStatus.OK, response.getStatusCode()); // Returns error JSON with 200
            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("error"));
            Assertions.assertTrue(jsonNode.get("error").asText().contains("PDF file is required"));
        }

        @Test
        @DisplayName("Should reject empty file")
        void testValidation_EmptyFile() throws IOException {
            MockMultipartFile emptyFile =
                    new MockMultipartFile(
                            "file", "empty.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[0]);

            PDFFile request = new PDFFile();
            request.setFileInput(emptyFile);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("error"));
        }

        @Test
        @DisplayName("Should reject file that exceeds max size")
        void testValidation_TooLargeFile() throws IOException {
            MultipartFile largeFile =
                    new MultipartFile() {
                        @Override
                        public String getName() {
                            return "file";
                        }

                        @Override
                        public String getOriginalFilename() {
                            return "large.pdf";
                        }

                        @Override
                        public String getContentType() {
                            return MediaType.APPLICATION_PDF_VALUE;
                        }

                        @Override
                        public boolean isEmpty() {
                            return false;
                        }

                        @Override
                        public long getSize() {
                            // Report 101 MB without allocating memory
                            return 101L * 1024L * 1024L;
                        }

                        @Override
                        public byte[] getBytes() {
                            return new byte[0];
                        }

                        @Override
                        public java.io.InputStream getInputStream() {
                            return java.io.InputStream.nullInputStream();
                        }

                        @Override
                        public void transferTo(java.io.File dest) throws IllegalStateException {}
                    };

            PDFFile request = new PDFFile();
            request.setFileInput(largeFile);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);

            Assertions.assertTrue(jsonNode.has("error"));
            Assertions.assertTrue(
                    jsonNode.get("error").asText().contains("exceeds maximum allowed size"));
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

        @Test
        @DisplayName("Should check for PDF/A standard")
        void testCheckForStandard_PdfA() throws IOException {
            // This would require a real PDF/A document or mocking
            PDDocument document = createSimplePdfWithText("Test");
            boolean result = GetInfoOnPDF.checkForStandard(document, "PDF/A");
            Assertions.assertFalse(result); // Simple PDF is not PDF/A compliant
            document.close();
        }

        @Test
        @DisplayName("Should handle null document in checkForStandard")
        void testCheckForStandard_NullDocument() {
            boolean result = GetInfoOnPDF.checkForStandard(null, "PDF/A");
            Assertions.assertFalse(result);
        }

        @Test
        @DisplayName("Should get PDF/A conformance level")
        void testGetPdfAConformanceLevel() throws IOException {
            PDDocument document = createSimplePdfWithText("Test");
            String level = GetInfoOnPDF.getPdfAConformanceLevel(document);
            Assertions.assertNull(level);
            document.close();
        }

        @Test
        @DisplayName("Should handle encrypted document in getPdfAConformanceLevel")
        void testGetPdfAConformanceLevel_EncryptedDocument() throws IOException {
            PDDocument document = createEncryptedPdf();
            String level = GetInfoOnPDF.getPdfAConformanceLevel(document);
            Assertions.assertNull(level); // Encrypted documents return null
            document.close();
        }
    }

    @Nested
    @DisplayName("Real PDF Files Tests")
    class RealPdfFilesTests {

        @Test
        @DisplayName("Should process example.pdf from test resources")
        void testRealPdf_Example() {
            try {
                MockMultipartFile mockFile = loadPdfFromResources("example.pdf");

                PDFFile request = new PDFFile();
                request.setFileInput(mockFile);

                try (PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes())) {
                    Mockito.when(
                                    pdfDocumentFactory.load(
                                            ArgumentMatchers.any(MultipartFile.class),
                                            ArgumentMatchers.anyBoolean()))
                            .thenReturn(loadedDoc);

                    ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

                    Assertions.assertNotNull(response);
                    Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());

                    String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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
                MockMultipartFile mockFile = loadPdfFromResources("tables.pdf");

                PDFFile request = new PDFFile();
                request.setFileInput(mockFile);

                try (PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes())) {
                    Mockito.when(
                                    pdfDocumentFactory.load(
                                            ArgumentMatchers.any(MultipartFile.class),
                                            ArgumentMatchers.anyBoolean()))
                            .thenReturn(loadedDoc);

                    ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

                    Assertions.assertNotNull(response);
                    String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
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
        @DisplayName("Should check PDF/A compliance")
        void testCompliance_PdfA() throws IOException {
            PDDocument document = createSimplePdfWithText("Test PDF/A");
            MockMultipartFile mockFile = documentToMultipartFile(document, "pdfa.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode compliancy = jsonNode.get("Compliancy");

            Assertions.assertTrue(compliancy.has("IsPDF/ACompliant"));
            Assertions.assertTrue(compliancy.has("IsPDF/XCompliant"));
            Assertions.assertTrue(compliancy.has("IsPDF/ECompliant"));
            Assertions.assertTrue(compliancy.has("IsPDF/UACompliant"));

            loadedDoc.close();
        }
    }

    @Nested
    @DisplayName("Image Statistics Tests")
    class ImageStatisticsTests {

        @Test
        @DisplayName("Should extract image statistics from PDF")
        void testImageStatistics() throws IOException {
            PDDocument document = createSimplePdfWithText("Document for image statistics");
            MockMultipartFile mockFile = documentToMultipartFile(document, "no-images.pdf");

            PDFFile request = new PDFFile();
            request.setFileInput(mockFile);

            PDDocument loadedDoc = Loader.loadPDF(mockFile.getBytes());
            Mockito.when(
                            pdfDocumentFactory.load(
                                    ArgumentMatchers.any(MultipartFile.class),
                                    ArgumentMatchers.anyBoolean()))
                    .thenReturn(loadedDoc);

            ResponseEntity<byte[]> response = getInfoOnPDF.getPdfInfo(request);

            String jsonResponse = new String(response.getBody(), StandardCharsets.UTF_8);
            JsonNode jsonNode = objectMapper.readTree(jsonResponse);
            JsonNode basicInfo = jsonNode.get("BasicInfo");

            Assertions.assertTrue(basicInfo.has("TotalImages"));
            Assertions.assertTrue(basicInfo.has("UniqueImages"));
            Assertions.assertEquals(0, basicInfo.get("TotalImages").asInt());
            Assertions.assertEquals(0, basicInfo.get("UniqueImages").asInt());

            loadedDoc.close();
        }
    }
}
