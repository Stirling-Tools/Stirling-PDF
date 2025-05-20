package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.*;
import java.nio.file.*;
import java.nio.file.Files;
import java.util.Arrays;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.SpyPDFDocumentFactory.StrategyType;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@Execution(value = ExecutionMode.SAME_THREAD)
class CustomPDFDocumentFactoryTest {

    private SpyPDFDocumentFactory factory;
    private byte[] basePdfBytes;

    @BeforeEach
    void setup() throws IOException {
        PdfMetadataService mockService = mock(PdfMetadataService.class);
        factory = new SpyPDFDocumentFactory(mockService);

        try (InputStream is = getClass().getResourceAsStream("/example.pdf")) {
            assertNotNull(is, "example.pdf must be present in src/test/resources");
            basePdfBytes = is.readAllBytes();
        }
    }

    @ParameterizedTest
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    void testStrategy_FileInput(int sizeMB, StrategyType expected) throws IOException {
        File file = writeTempFile(inflatePdf(basePdfBytes, sizeMB));
        try (PDDocument doc = factory.load(file)) {
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    void testStrategy_ByteArray(int sizeMB, StrategyType expected) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);
        try (PDDocument doc = factory.load(inflated)) {
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    void testStrategy_InputStream(int sizeMB, StrategyType expected) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);
        try (PDDocument doc = factory.load(new ByteArrayInputStream(inflated))) {
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    void testStrategy_MultipartFile(int sizeMB, StrategyType expected) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);
        MockMultipartFile multipart =
                new MockMultipartFile("file", "doc.pdf", "application/pdf", inflated);
        try (PDDocument doc = factory.load(multipart)) {
            assertEquals(expected, factory.lastStrategyUsed);
        }
    }

    @ParameterizedTest
    @CsvSource({"5,MEMORY_ONLY", "20,MIXED", "60,TEMP_FILE"})
    void testStrategy_PDFFile(int sizeMB, StrategyType expected) throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, sizeMB);
        MockMultipartFile multipart =
                new MockMultipartFile("file", "doc.pdf", "application/pdf", inflated);
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(multipart);
        try (PDDocument doc = factory.load(pdfFile)) {
            assertEquals(expected, factory.lastStrategyUsed);
        }
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

    @Test
    void testLoadFromPath() throws IOException {
        File file = writeTempFile(inflatePdf(basePdfBytes, 5));
        Path path = file.toPath();
        try (PDDocument doc = factory.load(path)) {
            assertNotNull(doc);
        }
    }

    @Test
    void testLoadFromStringPath() throws IOException {
        File file = writeTempFile(inflatePdf(basePdfBytes, 5));
        try (PDDocument doc = factory.load(file.getAbsolutePath())) {
            assertNotNull(doc);
        }
    }

    // neeed to add password pdf
    //    @Test
    //    void testLoadPasswordProtectedPdfFromInputStream() throws IOException {
    //        try (InputStream is = getClass().getResourceAsStream("/protected.pdf")) {
    //            assertNotNull(is, "protected.pdf must be present in src/test/resources");
    //            try (PDDocument doc = factory.load(is, "test123")) {
    //                assertNotNull(doc);
    //            }
    //        }
    //    }
    //
    //    @Test
    //    void testLoadPasswordProtectedPdfFromMultipart() throws IOException {
    //        try (InputStream is = getClass().getResourceAsStream("/protected.pdf")) {
    //            assertNotNull(is, "protected.pdf must be present in src/test/resources");
    //            byte[] bytes = is.readAllBytes();
    //            MockMultipartFile file = new MockMultipartFile("file", "protected.pdf",
    // "application/pdf", bytes);
    //            try (PDDocument doc = factory.load(file, "test123")) {
    //                assertNotNull(doc);
    //            }
    //        }
    //    }

    @Test
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
    void testCreateNewDocument() throws IOException {
        try (PDDocument doc = factory.createNewDocument()) {
            assertNotNull(doc);
        }
    }

    @Test
    void testCreateNewDocumentBasedOnOldDocument() throws IOException {
        byte[] inflated = inflatePdf(basePdfBytes, 5);
        try (PDDocument oldDoc = Loader.loadPDF(inflated);
                PDDocument newDoc = factory.createNewDocumentBasedOnOldDocument(oldDoc)) {
            assertNotNull(newDoc);
        }
    }

    @Test
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
    void testCreateNewBytesBasedOnOldDocument() throws IOException {
        byte[] newBytes = factory.createNewBytesBasedOnOldDocument(basePdfBytes);
        assertNotNull(newBytes);
        assertTrue(newBytes.length > 0);
    }

    private File writeTempFile(byte[] content) throws IOException {
        File file = Files.createTempFile("pdf-test-", ".pdf").toFile();
        Files.write(file.toPath(), content);
        return file;
    }

    @BeforeEach
    void cleanup() {
        System.gc();
    }
}
