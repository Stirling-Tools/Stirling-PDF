package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;
import static org.junit.jupiter.api.Assertions.assertThrows;
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

            pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

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

            pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

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

            pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

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

            pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

            verify(embeddedFilesTree).setNames(anyMap());
        }
    }
}
