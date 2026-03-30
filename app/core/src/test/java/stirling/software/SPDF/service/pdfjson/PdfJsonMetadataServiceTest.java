package stirling.software.SPDF.service.pdfjson;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Calendar;
import java.util.TimeZone;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonMetadata;

class PdfJsonMetadataServiceTest {

    private PdfJsonMetadataService service;

    @BeforeEach
    void setUp() {
        service = new PdfJsonMetadataService();
    }

    // --- extractMetadata tests ---

    @Test
    void extractMetadata_withAllFields_populatesMetadata() {
        PDDocument document = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(document.getDocumentInformation()).thenReturn(info);
        when(document.getNumberOfPages()).thenReturn(5);
        when(info.getTitle()).thenReturn("Test Title");
        when(info.getAuthor()).thenReturn("Author");
        when(info.getSubject()).thenReturn("Subject");
        when(info.getKeywords()).thenReturn("key1,key2");
        when(info.getCreator()).thenReturn("Creator");
        when(info.getProducer()).thenReturn("Producer");
        when(info.getTrapped()).thenReturn("True");

        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        cal.setTimeInMillis(1000000000L);
        when(info.getCreationDate()).thenReturn(cal);
        when(info.getModificationDate()).thenReturn(cal);

        PdfJsonMetadata result = service.extractMetadata(document);

        assertEquals("Test Title", result.getTitle());
        assertEquals("Author", result.getAuthor());
        assertEquals("Subject", result.getSubject());
        assertEquals("key1,key2", result.getKeywords());
        assertEquals("Creator", result.getCreator());
        assertEquals("Producer", result.getProducer());
        assertEquals("True", result.getTrapped());
        assertEquals(5, result.getNumberOfPages());
        assertNotNull(result.getCreationDate());
        assertNotNull(result.getModificationDate());
    }

    @Test
    void extractMetadata_nullInfo_setsOnlyPageCount() {
        PDDocument document = mock(PDDocument.class);
        when(document.getDocumentInformation()).thenReturn(null);
        when(document.getNumberOfPages()).thenReturn(3);

        PdfJsonMetadata result = service.extractMetadata(document);

        assertNull(result.getTitle());
        assertEquals(3, result.getNumberOfPages());
    }

    @Test
    void extractMetadata_nullDates_returnsNullDates() {
        PDDocument document = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(document.getDocumentInformation()).thenReturn(info);
        when(document.getNumberOfPages()).thenReturn(1);
        when(info.getCreationDate()).thenReturn(null);
        when(info.getModificationDate()).thenReturn(null);

        PdfJsonMetadata result = service.extractMetadata(document);

        assertNull(result.getCreationDate());
        assertNull(result.getModificationDate());
    }

    // --- extractXmpMetadata tests ---

    @Test
    void extractXmpMetadata_nullCatalog_returnsNull() {
        PDDocument document = mock(PDDocument.class);
        when(document.getDocumentCatalog()).thenReturn(null);

        assertNull(service.extractXmpMetadata(document));
    }

    @Test
    void extractXmpMetadata_nullMetadata_returnsNull() {
        PDDocument document = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(document.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getMetadata()).thenReturn(null);

        assertNull(service.extractXmpMetadata(document));
    }

    @Test
    void extractXmpMetadata_withData_returnsBase64() throws IOException {
        byte[] xmpData = "<xmp>test</xmp>".getBytes();
        try (PDDocument document = new PDDocument()) {
            document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            PDMetadata metadata = new PDMetadata(document, new ByteArrayInputStream(xmpData));
            document.getDocumentCatalog().setMetadata(metadata);

            String result = service.extractXmpMetadata(document);
            assertNotNull(result);
            assertArrayEquals(xmpData, Base64.getDecoder().decode(result));
        }
    }

    @Test
    void extractXmpMetadata_emptyData_returnsNull() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            PDMetadata metadata = new PDMetadata(document, new ByteArrayInputStream(new byte[0]));
            document.getDocumentCatalog().setMetadata(metadata);

            assertNull(service.extractXmpMetadata(document));
        }
    }

    @Test
    void extractXmpMetadata_ioException_returnsNull() throws IOException {
        PDDocument document = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        PDMetadata metadata = mock(PDMetadata.class);
        when(document.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getMetadata()).thenReturn(metadata);
        when(metadata.createInputStream()).thenThrow(new IOException("read error"));

        assertNull(service.extractXmpMetadata(document));
    }

    // --- applyMetadata tests ---

    @Test
    void applyMetadata_nullMetadata_doesNothing() {
        PDDocument document = mock(PDDocument.class);
        service.applyMetadata(document, null);
        verify(document, never()).getDocumentInformation();
    }

    @Test
    void applyMetadata_setsAllFields() {
        PDDocument document = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(document.getDocumentInformation()).thenReturn(info);

        PdfJsonMetadata metadata = new PdfJsonMetadata();
        metadata.setTitle("T");
        metadata.setAuthor("A");
        metadata.setSubject("S");
        metadata.setKeywords("K");
        metadata.setCreator("C");
        metadata.setProducer("P");
        metadata.setTrapped("True");
        metadata.setCreationDate("2020-01-01T00:00:00Z");
        metadata.setModificationDate("2021-06-15T12:30:00Z");

        service.applyMetadata(document, metadata);

        verify(info).setTitle("T");
        verify(info).setAuthor("A");
        verify(info).setSubject("S");
        verify(info).setKeywords("K");
        verify(info).setCreator("C");
        verify(info).setProducer("P");
        verify(info).setTrapped("True");
        verify(info).setCreationDate(any(Calendar.class));
        verify(info).setModificationDate(any(Calendar.class));
    }

    @Test
    void applyMetadata_invalidDateFormat_doesNotSetDate() {
        PDDocument document = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(document.getDocumentInformation()).thenReturn(info);

        PdfJsonMetadata metadata = new PdfJsonMetadata();
        metadata.setCreationDate("not-a-date");

        service.applyMetadata(document, metadata);

        verify(info, never()).setCreationDate(any(Calendar.class));
    }

    // --- applyXmpMetadata tests ---

    @Test
    void applyXmpMetadata_nullBase64_doesNothing() {
        PDDocument document = mock(PDDocument.class);
        service.applyXmpMetadata(document, null);
        verify(document, never()).getDocumentCatalog();
    }

    @Test
    void applyXmpMetadata_blankBase64_doesNothing() {
        PDDocument document = mock(PDDocument.class);
        service.applyXmpMetadata(document, "   ");
        verify(document, never()).getDocumentCatalog();
    }

    @Test
    void applyXmpMetadata_invalidBase64_doesNotThrow() {
        PDDocument document = mock(PDDocument.class);
        // Invalid base64 should be caught
        service.applyXmpMetadata(document, "not!!valid!!base64");
        // Should not throw
    }
}
