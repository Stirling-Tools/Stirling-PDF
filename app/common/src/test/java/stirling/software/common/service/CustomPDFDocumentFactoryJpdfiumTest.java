package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.jpdfium.doc.MetadataTag;

class CustomPDFDocumentFactoryJpdfiumTest {

    private CustomPDFDocumentFactory factory;
    private byte[] basePdfBytes;

    @BeforeEach
    void setup() throws IOException {
        PdfMetadataService mockService = mock(PdfMetadataService.class);
        factory = new CustomPDFDocumentFactory(mockService);
        try (InputStream is = getClass().getResourceAsStream("/example.pdf")) {
            assertNotNull(is, "example.pdf must be present in src/test/resources");
            basePdfBytes = is.readAllBytes();
        }
    }

    @Test
    void pageCountFastPath_matchesPDFBoxOracle(@TempDir Path tmp) throws IOException {
        Path pdf = tmp.resolve("example.pdf");
        Files.write(pdf, basePdfBytes);
        int expected;
        try (PDDocument doc = Loader.loadPDF(basePdfBytes)) {
            expected = doc.getNumberOfPages();
        }
        assertEquals(expected, factory.pageCountFast(pdf));
    }

    @Test
    void pageCountFastMultipart_matchesPDFBoxOracle() throws IOException {
        MockMultipartFile multipart =
                new MockMultipartFile("file", "example.pdf", "application/pdf", basePdfBytes);
        int expected;
        try (PDDocument doc = Loader.loadPDF(basePdfBytes)) {
            expected = doc.getNumberOfPages();
        }
        assertEquals(expected, factory.pageCountFast(multipart));
    }

    @Test
    void infoDictFastPath_matchesPDFBoxOracle(@TempDir Path tmp) throws IOException {
        Path pdf = tmp.resolve("example.pdf");
        Files.write(pdf, basePdfBytes);
        Map<String, String> jpdfium = factory.infoDictFast(pdf);
        try (PDDocument doc = Loader.loadPDF(basePdfBytes)) {
            PDDocumentInformation info = doc.getDocumentInformation();
            assertInfoMatches("Title", info.getTitle(), jpdfium);
            assertInfoMatches("Author", info.getAuthor(), jpdfium);
            assertInfoMatches("Subject", info.getSubject(), jpdfium);
            assertInfoMatches("Producer", info.getProducer(), jpdfium);
            assertInfoMatches("Creator", info.getCreator(), jpdfium);
            assertInfoMatches("Keywords", info.getKeywords(), jpdfium);
        }
    }

    @Test
    void infoTagFastTitle_matchesPDFBoxOracle(@TempDir Path tmp) throws IOException {
        Path pdf = tmp.resolve("example.pdf");
        Files.write(pdf, basePdfBytes);
        Optional<String> title = factory.infoTagFast(pdf, MetadataTag.TITLE);
        try (PDDocument doc = Loader.loadPDF(basePdfBytes)) {
            String pdfboxTitle = doc.getDocumentInformation().getTitle();
            if (pdfboxTitle == null || pdfboxTitle.isEmpty()) {
                assertTrue(
                        title.isEmpty() || title.get().isEmpty(),
                        "JPDFium title should be empty when PDFBox returns null");
            } else {
                assertEquals(pdfboxTitle, title.orElse(""));
            }
        }
    }

    @Test
    void infoTagFastMultipart_matchesPDFBoxOracle() throws IOException {
        MockMultipartFile multipart =
                new MockMultipartFile("file", "example.pdf", "application/pdf", basePdfBytes);
        Optional<String> producer = factory.infoTagFast(multipart, MetadataTag.PRODUCER);
        try (PDDocument doc = Loader.loadPDF(basePdfBytes)) {
            String pdfboxProducer = doc.getDocumentInformation().getProducer();
            if (pdfboxProducer == null || pdfboxProducer.isEmpty()) {
                assertTrue(producer.isEmpty() || producer.get().isEmpty());
            } else {
                assertEquals(pdfboxProducer, producer.orElse(""));
            }
        }
    }

    private static void assertInfoMatches(
            String tag, String pdfboxValue, Map<String, String> jpdfiumDict) {
        String jp = jpdfiumDict.get(tag);
        if (pdfboxValue == null || pdfboxValue.isEmpty()) {
            assertTrue(
                    jp == null || jp.isEmpty(),
                    tag + " should be empty when PDFBox returns null/empty (got: " + jp + ")");
        } else {
            assertEquals(pdfboxValue, jp, tag + " mismatch");
        }
    }
}
