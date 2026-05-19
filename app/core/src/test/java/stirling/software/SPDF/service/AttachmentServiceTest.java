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

import stirling.software.SPDF.model.api.misc.AttachmentInfo;

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
    void addAttachmentToPDF_WithNullContentType() throws IOException {
        try (var document = new PDDocument()) {
            var attachments = List.of(mock(MultipartFile.class));
            when(attachments.get(0).getOriginalFilename()).thenReturn("file.bin");
            when(attachments.get(0).getInputStream())
                    .thenReturn(new ByteArrayInputStream("binary".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(6L);
            when(attachments.get(0).getContentType()).thenReturn(null);
            PDDocument result = attachmentService.addAttachment(document, attachments);
            assertNotNull(result);
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
    void addAttachmentToPDF_EmptyList() throws IOException {
        try (var document = new PDDocument()) {
            PDDocument result = attachmentService.addAttachment(document, List.of());
            assertNotNull(result);
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

    @Test
    void extractAttachments_EmptyDocumentReturnsEmpty() throws IOException {
        try (var document = new PDDocument()) {
            Optional<byte[]> extracted = attachmentService.extractAttachments(document);
            assertTrue(extracted.isEmpty());
        }
    }

    @Test
    void extractAttachments_MultipleFiles() throws IOException {
        attachmentService = new AttachmentService(1024 * 1024, 5 * 1024 * 1024);
        try (var document = new PDDocument()) {
            var file1 =
                    new MockMultipartFile(
                            "file", "a.txt", MediaType.TEXT_PLAIN_VALUE, "aaa".getBytes());
            var file2 =
                    new MockMultipartFile(
                            "file", "b.txt", MediaType.TEXT_PLAIN_VALUE, "bbb".getBytes());
            attachmentService.addAttachment(document, List.of(file1, file2));
            Optional<byte[]> extracted = attachmentService.extractAttachments(document);
            assertTrue(extracted.isPresent());
            int count = 0;
            try (var zis = new ZipInputStream(new ByteArrayInputStream(extracted.get()))) {
                while (zis.getNextEntry() != null) {
                    count++;
                }
            }
            assertEquals(2, count);
        }
    }

    @Test
    void listAttachments_EmptyDocument() throws IOException {
        try (var document = new PDDocument()) {
            List<AttachmentInfo> attachments = attachmentService.listAttachments(document);
            assertTrue(attachments.isEmpty());
        }
    }

    @Test
    void listAttachments_WithAttachments() throws IOException {
        try (var document = new PDDocument()) {
            var file1 =
                    new MockMultipartFile(
                            "file", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, "pdf".getBytes());
            var file2 =
                    new MockMultipartFile(
                            "file", "text.txt", MediaType.TEXT_PLAIN_VALUE, "text".getBytes());
            attachmentService.addAttachment(document, List.of(file1, file2));
            List<AttachmentInfo> result = attachmentService.listAttachments(document);
            assertEquals(2, result.size());
            boolean foundPdf = result.stream().anyMatch(a -> "doc.pdf".equals(a.getFilename()));
            boolean foundTxt = result.stream().anyMatch(a -> "text.txt".equals(a.getFilename()));
            assertTrue(foundPdf);
            assertTrue(foundTxt);
        }
    }

    @Test
    void listAttachments_ChecksAttachmentInfoFields() throws IOException {
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file",
                            "report.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            "content".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            List<AttachmentInfo> result = attachmentService.listAttachments(document);
            assertEquals(1, result.size());
            AttachmentInfo info = result.get(0);
            assertEquals("report.pdf", info.getFilename());
            assertNotNull(info.getSize());
            assertEquals(MediaType.APPLICATION_PDF_VALUE, info.getContentType());
            assertNotNull(info.getDescription());
        }
    }

    @Test
    void renameAttachment_Success() throws IOException {
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file", "old.txt", MediaType.TEXT_PLAIN_VALUE, "data".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            PDDocument result = attachmentService.renameAttachment(document, "old.txt", "new.txt");
            assertNotNull(result);
            List<AttachmentInfo> attachments = attachmentService.listAttachments(result);
            assertEquals(1, attachments.size());
            assertEquals("new.txt", attachments.get(0).getFilename());
        }
    }

    @Test
    void renameAttachment_NotFoundThrowsException() throws IOException {
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file", "exists.txt", MediaType.TEXT_PLAIN_VALUE, "data".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> attachmentService.renameAttachment(document, "notexist.txt", "new.txt"));
        }
    }

    @Test
    void renameAttachment_EmptyDocumentThrowsException() throws IOException {
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file", "temp.txt", MediaType.TEXT_PLAIN_VALUE, "x".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            attachmentService.deleteAttachment(document, "temp.txt");
            assertThrows(
                    IllegalArgumentException.class,
                    () -> attachmentService.renameAttachment(document, "gone.txt", "new.txt"));
        }
    }

    @Test
    void deleteAttachment_Success() throws IOException {
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file", "delete_me.txt", MediaType.TEXT_PLAIN_VALUE, "bye".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            PDDocument result = attachmentService.deleteAttachment(document, "delete_me.txt");
            assertNotNull(result);
            List<AttachmentInfo> remaining = attachmentService.listAttachments(result);
            assertTrue(remaining.isEmpty());
        }
    }

    @Test
    void deleteAttachment_NotFoundThrowsException() throws IOException {
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file", "keep.txt", MediaType.TEXT_PLAIN_VALUE, "stay".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> attachmentService.deleteAttachment(document, "nope.txt"));
        }
    }

    @Test
    void deleteAttachment_OneOfMultiple() throws IOException {
        try (var document = new PDDocument()) {
            var file1 =
                    new MockMultipartFile(
                            "file", "keep.txt", MediaType.TEXT_PLAIN_VALUE, "keep".getBytes());
            var file2 =
                    new MockMultipartFile(
                            "file", "remove.txt", MediaType.TEXT_PLAIN_VALUE, "remove".getBytes());
            attachmentService.addAttachment(document, List.of(file1, file2));
            attachmentService.deleteAttachment(document, "remove.txt");
            List<AttachmentInfo> remaining = attachmentService.listAttachments(document);
            assertEquals(1, remaining.size());
            assertEquals("keep.txt", remaining.get(0).getFilename());
        }
    }

    @Test
    void roundTrip_AddListExtractDelete() throws IOException {
        attachmentService = new AttachmentService(1024 * 1024, 5 * 1024 * 1024);
        try (var document = new PDDocument()) {
            var file =
                    new MockMultipartFile(
                            "file",
                            "roundtrip.txt",
                            MediaType.TEXT_PLAIN_VALUE,
                            "round trip data".getBytes());
            attachmentService.addAttachment(document, List.of(file));
            List<AttachmentInfo> listed = attachmentService.listAttachments(document);
            assertEquals(1, listed.size());
            assertEquals("roundtrip.txt", listed.get(0).getFilename());
            Optional<byte[]> extracted = attachmentService.extractAttachments(document);
            assertTrue(extracted.isPresent());
            attachmentService.deleteAttachment(document, "roundtrip.txt");
            List<AttachmentInfo> afterDelete = attachmentService.listAttachments(document);
            assertTrue(afterDelete.isEmpty());
        }
    }

    @Test
    void constructorWithCustomLimits() {
        AttachmentService custom = new AttachmentService(100, 500);
        assertNotNull(custom);
    }

    @Test
    void defaultConstructor() {
        AttachmentService defaultService = new AttachmentService();
        assertNotNull(defaultService);
    }
}
