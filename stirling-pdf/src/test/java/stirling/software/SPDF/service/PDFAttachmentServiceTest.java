package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PDFAttachmentServiceTest {

    private PDFAttachmentService pdfAttachmentService;

    @BeforeEach
    void setUp() {
        pdfAttachmentService = new PDFAttachmentService();
    }

    @Test
    void addAttachmentToPDF() throws IOException {
        try (var document = new PDDocument()) {
            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));
            var existingNames = new HashMap<String, PDComplexFileSpecification>();

            when(embeddedFilesTree.getNames()).thenReturn(existingNames);
            when(attachments.get(0).getOriginalFilename()).thenReturn("test.txt");
            when(attachments.get(0).getInputStream()).thenReturn(
                    new ByteArrayInputStream("Test content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(12L);
            when(attachments.get(0).getContentType()).thenReturn("text/plain");

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }

    @Test
    void addAttachmentToPDF_WithNullExistingNames() throws IOException {
        try (var document = new PDDocument()) {
            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));

            when(embeddedFilesTree.getNames()).thenReturn(null);
            when(attachments.get(0).getOriginalFilename()).thenReturn("document.pdf");
            when(attachments.get(0).getInputStream()).thenReturn(
                    new ByteArrayInputStream("PDF content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(15L);
            when(attachments.get(0).getContentType()).thenReturn("application/pdf");

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }

    @Test
    void addAttachmentToPDF_WithBlankContentType() throws IOException {
        try (var document = new PDDocument()) {
            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));
            var existingNames = new HashMap<String, PDComplexFileSpecification>();

            when(embeddedFilesTree.getNames()).thenReturn(existingNames);
            when(attachments.get(0).getOriginalFilename()).thenReturn("image.jpg");
            when(attachments.get(0).getInputStream()).thenReturn(
                    new ByteArrayInputStream("Image content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(25L);
            when(attachments.get(0).getContentType()).thenReturn("");

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }

    @Test
    void addAttachmentToPDF_GetNamesThrowsIOException() throws IOException {
        var document = mock(PDDocument.class);
        var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
        var attachments = List.of(mock(MultipartFile.class));
        var ioException = new IOException("Failed to retrieve embedded files");

        when(embeddedFilesTree.getNames()).thenThrow(ioException);

        assertThrows(IOException.class, () -> pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments));

        verify(embeddedFilesTree).getNames();
    }

    @Test
    void addAttachmentToPDF_AttachmentInputStreamThrowsIOException() throws IOException {
        try (var document = new PDDocument()) {
            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));
            var existingNames = new HashMap<String, PDComplexFileSpecification>();
            var ioException = new IOException("Failed to read attachment stream");

            when(embeddedFilesTree.getNames()).thenReturn(existingNames);
            when(attachments.get(0).getOriginalFilename()).thenReturn("corrupted.file");
            when(attachments.get(0).getInputStream()).thenThrow(ioException);
            when(attachments.get(0).getSize()).thenReturn(10L);

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }

    @Test
    void addAttachmentToPDF_WithProtectedDocument() throws IOException {
        try (var document = new PDDocument()) {
            // Create a document with restricted permissions (this simulates an encrypted/protected document)
            AccessPermission ap = new AccessPermission();
            ap.setCanExtractContent(false); // Restrict content extraction initially
            var spp = new StandardProtectionPolicy("owner", "user", ap);
            document.protect(spp);

            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));
            var existingNames = new HashMap<String, PDComplexFileSpecification>();

            when(embeddedFilesTree.getNames()).thenReturn(existingNames);
            when(attachments.get(0).getOriginalFilename()).thenReturn("test.txt");
            when(attachments.get(0).getInputStream()).thenReturn(
                    new ByteArrayInputStream("Test content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(12L);
            when(attachments.get(0).getContentType()).thenReturn("text/plain");

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }

    @Test
    void addAttachmentToPDF_WithRestrictedPermissions() throws IOException {
        try (var document = new PDDocument()) {
            // Create a document with very restricted permissions that should block permission changes
            AccessPermission ap = new AccessPermission();
            ap.setCanModify(false);
            ap.setCanAssembleDocument(false);
            ap.setCanExtractContent(false);
            var spp = new StandardProtectionPolicy("owner", "user", ap);
            document.protect(spp);

            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));
            var existingNames = new HashMap<String, PDComplexFileSpecification>();

            when(embeddedFilesTree.getNames()).thenReturn(existingNames);
            when(attachments.get(0).getOriginalFilename()).thenReturn("test.txt");
            when(attachments.get(0).getInputStream()).thenReturn(
                    new ByteArrayInputStream("Test content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(12L);
            when(attachments.get(0).getContentType()).thenReturn("text/plain");

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }

    @Test
    void addAttachmentToPDF_WithNonEncryptedDocument() throws IOException {
        try (var document = new PDDocument()) {
            var embeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
            var attachments = List.of(mock(MultipartFile.class));
            var existingNames = new HashMap<String, PDComplexFileSpecification>();

            when(embeddedFilesTree.getNames()).thenReturn(existingNames);
            when(attachments.get(0).getOriginalFilename()).thenReturn("test.txt");
            when(attachments.get(0).getInputStream()).thenReturn(
                    new ByteArrayInputStream("Test content".getBytes()));
            when(attachments.get(0).getSize()).thenReturn(12L);
            when(attachments.get(0).getContentType()).thenReturn("text/plain");

            byte[] result = pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            assertNotNull(result);
            assertTrue(result.length > 0);
            // Verify permissions are set correctly for non-encrypted documents
            AccessPermission permissions = document.getCurrentAccessPermission();
            assertTrue(permissions.canExtractContent());
            assertTrue(permissions.canExtractForAccessibility());
            assertTrue(permissions.canModifyAnnotations());
            verify(embeddedFilesTree).setNames(anyMap());
        }
    }
}
