package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
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
            when(attachment1.getContentType()).thenReturn(MediaType.APPLICATION_PDF_VALUE);

            when(attachment2.getOriginalFilename()).thenReturn("image.jpg");
            when(attachment2.getInputStream())
                    .thenReturn(new ByteArrayInputStream("Image content".getBytes()));
            when(attachment2.getSize()).thenReturn(20L);
            when(attachment2.getContentType()).thenReturn(MediaType.IMAGE_JPEG_VALUE);

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

    @Test
    void extractAttachments_SanitizesFilenamesAndExtractsData() throws IOException {
        attachmentService = new AttachmentService(1024 * 1024, 5 * 1024 * 1024);

        try (var document = new PDDocument()) {
            var maliciousAttachment =
                    new MockMultipartFile(
                            "file",
                            "..\\evil/../../tricky.txt",
                            MediaType.TEXT_PLAIN_VALUE,
                            "danger".getBytes());

            attachmentService.addAttachment(document, List.of(maliciousAttachment));

            Optional<byte[]> extracted = attachmentService.extractAttachments(document);
            assertTrue(extracted.isPresent());

            try (var zipInputStream =
                    new ZipInputStream(new ByteArrayInputStream(extracted.get()))) {
                ZipEntry entry = zipInputStream.getNextEntry();
                assertNotNull(entry);
                String sanitizedName = entry.getName();

                assertFalse(sanitizedName.contains(".."));
                assertFalse(sanitizedName.contains("/"));
                assertFalse(sanitizedName.contains("\\"));

                byte[] data = zipInputStream.readAllBytes();
                assertArrayEquals("danger".getBytes(), data);
                assertNull(zipInputStream.getNextEntry());
            }
        }
    }

    @Test
    void extractAttachments_SkipsAttachmentsExceedingSizeLimit() throws IOException {
        attachmentService = new AttachmentService(4, 10);

        try (var document = new PDDocument()) {
            var oversizedAttachment =
                    new MockMultipartFile(
                            "file",
                            "large.bin",
                            MediaType.APPLICATION_OCTET_STREAM_VALUE,
                            "too big".getBytes());

            attachmentService.addAttachment(document, List.of(oversizedAttachment));

            Optional<byte[]> extracted = attachmentService.extractAttachments(document);
            assertTrue(extracted.isEmpty());
        }
    }

    @Test
    void extractAttachments_EnforcesTotalSizeLimit() throws IOException {
        attachmentService = new AttachmentService(10, 9);

        try (var document = new PDDocument()) {
            var first =
                    new MockMultipartFile(
                            "file", "first.txt", MediaType.TEXT_PLAIN_VALUE, "12345".getBytes());
            var second =
                    new MockMultipartFile(
                            "file", "second.txt", MediaType.TEXT_PLAIN_VALUE, "67890".getBytes());

            attachmentService.addAttachment(document, List.of(first, second));

            Optional<byte[]> extracted = attachmentService.extractAttachments(document);
            assertTrue(extracted.isPresent());

            try (var zipInputStream =
                    new ZipInputStream(new ByteArrayInputStream(extracted.get()))) {
                ZipEntry firstEntry = zipInputStream.getNextEntry();
                assertNotNull(firstEntry);
                assertEquals("first.txt", firstEntry.getName());
                byte[] firstData = zipInputStream.readNBytes(5);
                assertArrayEquals("12345".getBytes(), firstData);
                assertNull(zipInputStream.getNextEntry());
            }
        }
    }
}
