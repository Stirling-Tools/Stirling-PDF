package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

class AttachmentServiceTest {

    private AttachmentService attachmentService;

    @BeforeEach
    void setUp() {
        attachmentService = new AttachmentService();
    }

    @Test
    void addAttachmentToPDF() throws IOException {
        try (var document = new PDDocument()) {
            document.setDocumentId(100L);
            var attachments = List.of(mock(MultipartFile.class));

            when(attachments.get(0).getOriginalFilename()).thenReturn("test.txt");
            when(attachments.get(0).getInputStream())
                    .thenReturn(new ByteArrayInputStream("Test content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(12L);
            when(attachments.get(0).getContentType()).thenReturn("text/plain");

            PDDocument result = attachmentService.addAttachment(document, attachments);

            assertNotNull(result);
            assertEquals(document.getDocumentId(), result.getDocumentId());
            assertNotNull(result.getDocumentCatalog().getNames());
        }
    }

    @Test
    void addAttachmentToPDF_MultipleAttachments() throws IOException {
        try (var document = new PDDocument()) {
            document.setDocumentId(100L);
            var attachment1 = mock(MultipartFile.class);
            var attachment2 = mock(MultipartFile.class);
            var attachments = List.of(attachment1, attachment2);

            when(attachment1.getOriginalFilename()).thenReturn("document.pdf");
            when(attachment1.getInputStream())
                    .thenReturn(new ByteArrayInputStream("PDF content".getBytes()));
            when(attachment1.getSize()).thenReturn(15L);
            when(attachment1.getContentType()).thenReturn("application/pdf");

            when(attachment2.getOriginalFilename()).thenReturn("image.jpg");
            when(attachment2.getInputStream())
                    .thenReturn(new ByteArrayInputStream("Image content".getBytes()));
            when(attachment2.getSize()).thenReturn(20L);
            when(attachment2.getContentType()).thenReturn("image/jpeg");

            PDDocument result = attachmentService.addAttachment(document, attachments);

            assertNotNull(result);
            assertNotNull(result.getDocumentCatalog().getNames());
        }
    }

    @Test
    void addAttachmentToPDF_WithBlankContentType() throws IOException {
        try (var document = new PDDocument()) {
            document.setDocumentId(100L);
            var attachments = List.of(mock(MultipartFile.class));

            when(attachments.get(0).getOriginalFilename()).thenReturn("image.jpg");
            when(attachments.get(0).getInputStream())
                    .thenReturn(new ByteArrayInputStream("Image content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(25L);
            when(attachments.get(0).getContentType()).thenReturn("");

            PDDocument result = attachmentService.addAttachment(document, attachments);

            assertNotNull(result);
            assertNotNull(result.getDocumentCatalog().getNames());
        }
    }

    @Test
    void addAttachmentToPDF_AttachmentInputStreamThrowsIOException() throws IOException {
        try (var document = new PDDocument()) {
            var attachments = List.of(mock(MultipartFile.class));
            var ioException = new IOException("Failed to read attachment stream");

            when(attachments.get(0).getOriginalFilename()).thenReturn("test.txt");
            when(attachments.get(0).getInputStream()).thenThrow(ioException);
            when(attachments.get(0).getSize()).thenReturn(10L);

            PDDocument result = attachmentService.addAttachment(document, attachments);

            assertNotNull(result);
            assertNotNull(result.getDocumentCatalog().getNames());
        }
    }
}
