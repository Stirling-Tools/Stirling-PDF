package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.SpyPDFDocumentFactory.StrategyType;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@Execution(ExecutionMode.SAME_THREAD)
@DisplayName("Tests for CustomPDFDocumentFactory")
class CustomPDFDocumentFactoryTest {

    private SpyPDFDocumentFactory factory;
    private byte[] basePdfBytes;

    @TempDir Path tempDir;

    @BeforeAll
    void loadBasePdf() throws IOException {
        try (InputStream is = getClass().getResourceAsStream("/example.pdf")) {
            assertNotNull(is, "Resource example.pdf must be in src/test/resources");
            basePdfBytes = is.readAllBytes();
            assertTrue(basePdfBytes.length > 0, "Base PDF should not be empty");
        }
    }

    @BeforeEach
    void setUp() {
        factory = new SpyPDFDocumentFactory(mock(PdfMetadataService.class));
    }

    @ParameterizedTest(name = "Load PDF with size {0}MB uses strategy {1}")
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    @DisplayName("Verify loading strategy based on file size (File input)")
    void testStrategy_FileInput(int sizeMB, String expectedName) throws IOException {
        File file = writeTempFile(inflatePdf(basePdfBytes, sizeMB));

        try (PDDocument doc = factory.load(file)) {
            assertNotNull(doc, "Loaded PDDocument must not be null");

            StrategyType expected = StrategyType.valueOf(expectedName);
            assertEquals(
                    expected,
                    factory.lastStrategyUsed,
                    "Expected strategy " + expected + " for file size " + sizeMB + "MB");
        }
    }

    @ParameterizedTest(name = "Load PDF bytes with size {0}MB uses strategy {1}")
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    @DisplayName("Verify loading strategy based on byte array size")
    void testStrategy_ByteArray(int sizeMB, String expectedName) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);

        try (PDDocument doc = factory.load(inflated)) {
            assertNotNull(doc);

            StrategyType expected = StrategyType.valueOf(expectedName);
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest(name = "Load PDF input stream with size {0}MB uses strategy {1}")
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    @DisplayName("Verify loading strategy based on InputStream size")
    void testStrategy_InputStream(int sizeMB, String expectedName) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);

        try (InputStream is = new ByteArrayInputStream(inflated);
                PDDocument doc = factory.load(is)) {
            assertNotNull(doc);

            StrategyType expected = StrategyType.valueOf(expectedName);
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest(name = "Load PDF multipart file with size {0}MB uses strategy {1}")
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    @DisplayName("Verify loading strategy based on MultipartFile size")
    void testStrategy_MultipartFile(int sizeMB, String expectedName) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);
        MockMultipartFile multipart =
                new MockMultipartFile("file", "doc.pdf", "application/pdf", inflated);

        try (PDDocument doc = factory.load(multipart)) {
            assertNotNull(doc);

            StrategyType expected = StrategyType.valueOf(expectedName);
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest(name = "Load PDFFile with size {0}MB uses strategy {1}")
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    @DisplayName("Verify loading strategy based on PDFFile composed object")
    void testStrategy_PDFFile(int sizeMB, String expectedName) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);
        MockMultipartFile multipart =
                new MockMultipartFile("file", "doc.pdf", "application/pdf", inflated);
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(multipart);

        try (PDDocument doc = factory.load(pdfFile)) {
            assertNotNull(doc);

            StrategyType expected = StrategyType.valueOf(expectedName);
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @Test
    @DisplayName("Load PDF document from Path")
    void testLoadFromPath() throws IOException {
        File file = writeTempFile(inflatePdf(basePdfBytes, 5));
        Path path = file.toPath();

        try (PDDocument doc = factory.load(path)) {
            assertNotNull(doc);
            assertTrue(doc.getNumberOfPages() > 0);
        }
    }

    @Test
    @DisplayName("Load PDF document from String path")
    void testLoadFromStringPath() throws IOException {
        File file = writeTempFile(inflatePdf(basePdfBytes, 5));
        try (PDDocument doc = factory.load(file.getAbsolutePath())) {
            assertNotNull(doc);
            assertTrue(doc.getNumberOfPages() > 0);
        }
    }

    @Test
    @DisplayName("Load PDF with readOnly true does not set default metadata")
    void testLoadReadOnlySkipsPostProcessing() throws IOException {
        PdfMetadataService mockService = mock(PdfMetadataService.class);
        CustomPDFDocumentFactory readOnlyFactory = new CustomPDFDocumentFactory(mockService);

        byte[] bytes = inflatePdf(basePdfBytes, 5);

        try (PDDocument doc = readOnlyFactory.load(bytes, true)) {
            assertNotNull(doc);
            verify(mockService, never()).setDefaultMetadata(any());
        }
    }

    @Test
    @DisplayName("Create a new PDF document")
    void testCreateNewDocument() throws IOException {
        try (PDDocument doc = factory.createNewDocument()) {
            assertNotNull(doc);
        }
    }

    @Test
    @DisplayName("Create a new PDF document based on an existing document")
    void testCreateNewDocumentBasedOnOldDocument() throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, 5);

        try (PDDocument oldDoc = Loader.loadPDF(inflated);
                PDDocument newDoc = factory.createNewDocumentBasedOnOldDocument(oldDoc)) {
            assertNotNull(newDoc);
        }
    }

    @Test
    @DisplayName("Round-trip: load PDF file to bytes and reload")
    void testLoadToBytesRoundTrip() throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, 5);
        File file = writeTempFile(inflated);

        byte[] resultBytes = factory.loadToBytes(file);

        try (PDDocument doc = Loader.loadPDF(resultBytes)) {
            assertNotNull(doc);
            assertTrue(doc.getNumberOfPages() > 0);
        }
    }

    @Test
    @DisplayName("Save a PDF document to bytes and reload")
    void testSaveToBytesAndReload() throws IOException {
        try (PDDocument doc = Loader.loadPDF(basePdfBytes)) {
            byte[] saved = factory.saveToBytes(doc);

            try (PDDocument reloaded = Loader.loadPDF(saved)) {
                assertNotNull(reloaded);
                assertEquals(doc.getNumberOfPages(), reloaded.getNumberOfPages());
            }
        }
    }

    @Test
    @DisplayName("Create new bytes based on an old document")
    void testCreateNewBytesBasedOnOldDocument() throws IOException {
        byte[] newBytes = factory.createNewBytesBasedOnOldDocument(basePdfBytes);
        assertNotNull(newBytes);
        assertTrue(newBytes.length > 0);
    }

    private byte[] inflatePdf(byte[] input, int sizeInMB) throws IOException {
        try (PDDocument doc = Loader.loadPDF(input)) {
            byte[] largeData = new byte[sizeInMB * 1024 * 1024];
            Arrays.fill(largeData, (byte) 'A');

            PDStream stream = new PDStream(doc, new ByteArrayInputStream(largeData));
            stream.getCOSObject().setItem(COSName.TYPE, COSName.XOBJECT);
            stream.getCOSObject().setItem(COSName.SUBTYPE, COSName.IMAGE);

            doc.getDocumentCatalog()
                    .getCOSObject()
                    .setItem(COSName.getPDFName("DummyBigStream"), stream.getCOSObject());

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private File writeTempFile(byte[] content) throws IOException {
        Path filePath = Files.createTempFile(tempDir, "pdf-test-", ".pdf");
        Files.write(filePath, content);
        return filePath.toFile();
    }
}
