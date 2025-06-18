package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PageMode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.service.PDFAttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class AttachmentsControllerTest {

    @Mock
    private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock
    private PDFAttachmentServiceInterface pdfAttachmentService;

    @InjectMocks
    private AttachmentsController attachmentsController;

    private MockMultipartFile pdfFile;
    private MockMultipartFile attachment1;
    private MockMultipartFile attachment2;
    private PDDocument mockDocument;
    private PDDocumentCatalog mockCatalog;
    private PDDocumentNameDictionary mockNameDict;
    private PDEmbeddedFilesNameTreeNode mockEmbeddedFilesTree;

    @BeforeEach
    void setUp() {
        pdfFile = new MockMultipartFile("fileInput", "test.pdf", "application/pdf", "PDF content".getBytes());
        attachment1 = new MockMultipartFile("attachment1", "file1.txt", "text/plain", "File 1 content".getBytes());
        attachment2 = new MockMultipartFile("attachment2", "file2.jpg", "image/jpeg", "Image content".getBytes());
        
        mockDocument = mock(PDDocument.class);
        mockCatalog = mock(PDDocumentCatalog.class);
        mockNameDict = mock(PDDocumentNameDictionary.class);
        mockEmbeddedFilesTree = mock(PDEmbeddedFilesNameTreeNode.class);
    }

    @Test
    void addAttachments_WithExistingNames() throws IOException {
        List<MultipartFile> attachments = List.of(attachment1, attachment2);
        byte[] expectedOutput = "modified PDF content".getBytes();

        when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(mockNameDict);
        when(mockNameDict.getEmbeddedFiles()).thenReturn(mockEmbeddedFilesTree);
        when(pdfAttachmentService.addAttachment(mockDocument, mockEmbeddedFilesTree, attachments)).thenReturn(expectedOutput);

        ResponseEntity<byte[]> response = attachmentsController.addAttachments(pdfFile, attachments);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(pdfDocumentFactory).load(pdfFile, false);
        verify(mockCatalog).setNames(mockNameDict);
        verify(pdfAttachmentService).addAttachment(mockDocument, mockEmbeddedFilesTree, attachments);
    }

    @Test
    void addAttachments_WithoutExistingNames() throws IOException {
        List<MultipartFile> attachments = List.of(attachment1);
        byte[] expectedOutput = "modified PDF content".getBytes();

        try (PDDocument realDocument = new PDDocument()) {
            when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(realDocument);
            when(pdfAttachmentService.addAttachment(eq(realDocument), any(PDEmbeddedFilesNameTreeNode.class), eq(attachments))).thenReturn(expectedOutput);

            ResponseEntity<byte[]> response = attachmentsController.addAttachments(pdfFile, attachments);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            verify(pdfDocumentFactory).load(pdfFile, false);
            verify(pdfAttachmentService).addAttachment(eq(realDocument), any(PDEmbeddedFilesNameTreeNode.class), eq(attachments));
        }
    }

    @Test
    void addAttachments_IOExceptionFromPDFLoad() throws IOException {
        List<MultipartFile> attachments = List.of(attachment1);
        IOException ioException = new IOException("Failed to load PDF");

        when(pdfDocumentFactory.load(pdfFile, false)).thenThrow(ioException);

        assertThrows(IOException.class, () -> attachmentsController.addAttachments(pdfFile, attachments));
        verify(pdfDocumentFactory).load(pdfFile, false);
        verifyNoInteractions(pdfAttachmentService);
    }

    @Test
    void addAttachments_IOExceptionFromAttachmentService() throws IOException {
        List<MultipartFile> attachments = List.of(attachment1);
        IOException ioException = new IOException("Failed to add attachment");

        when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(mockNameDict);
        when(mockNameDict.getEmbeddedFiles()).thenReturn(mockEmbeddedFilesTree);
        when(pdfAttachmentService.addAttachment(mockDocument, mockEmbeddedFilesTree, attachments)).thenThrow(ioException);

        assertThrows(IOException.class, () -> attachmentsController.addAttachments(pdfFile, attachments));
        verify(pdfAttachmentService).addAttachment(mockDocument, mockEmbeddedFilesTree, attachments);
    }

    @Test
    void removeAttachments_WithExistingNames() throws IOException {
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(mockNameDict);

        ResponseEntity<byte[]> response = attachmentsController.removeAttachments(pdfFile);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(pdfDocumentFactory).load(pdfFile);
        verify(mockNameDict).setEmbeddedFiles(null);
        verify(mockCatalog).setPageMode(PageMode.USE_NONE);
    }

    @Test
    void removeAttachments_WithoutExistingNames() throws IOException {
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(null);

        ResponseEntity<byte[]> response = attachmentsController.removeAttachments(pdfFile);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(pdfDocumentFactory).load(pdfFile);
        verify(mockCatalog).setPageMode(PageMode.USE_NONE);
        verifyNoInteractions(mockNameDict);
    }

    @Test
    void removeAttachments_IOExceptionFromPDFLoad() throws IOException {
        IOException ioException = new IOException("Failed to load PDF");

        when(pdfDocumentFactory.load(pdfFile)).thenThrow(ioException);

        assertThrows(IOException.class, () -> attachmentsController.removeAttachments(pdfFile));
        verify(pdfDocumentFactory).load(pdfFile);
    }

    @Test
    void addAttachments_EmptyAttachmentsList() throws IOException {
        List<MultipartFile> emptyAttachments = List.of();
        byte[] expectedOutput = "PDF content without new attachments".getBytes();

        when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(mockNameDict);
        when(mockNameDict.getEmbeddedFiles()).thenReturn(mockEmbeddedFilesTree);
        when(pdfAttachmentService.addAttachment(mockDocument, mockEmbeddedFilesTree, emptyAttachments)).thenReturn(expectedOutput);

        ResponseEntity<byte[]> response = attachmentsController.addAttachments(pdfFile, emptyAttachments);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(pdfAttachmentService).addAttachment(mockDocument, mockEmbeddedFilesTree, emptyAttachments);
    }

    @Test
    void addAttachments_NullFilename() throws IOException {
        MockMultipartFile attachmentWithNullName = new MockMultipartFile("attachment", null, "text/plain", "content".getBytes());
        List<MultipartFile> attachments = List.of(attachmentWithNullName);
        byte[] expectedOutput = "PDF with null filename attachment".getBytes();

        when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(mockNameDict);
        when(mockNameDict.getEmbeddedFiles()).thenReturn(mockEmbeddedFilesTree);
        when(pdfAttachmentService.addAttachment(mockDocument, mockEmbeddedFilesTree, attachments)).thenReturn(expectedOutput);

        ResponseEntity<byte[]> response = attachmentsController.addAttachments(pdfFile, attachments);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(pdfAttachmentService).addAttachment(mockDocument, mockEmbeddedFilesTree, attachments);
    }

    @Test
    void removeAttachments_NullPDFFilename() throws IOException {
        MockMultipartFile pdfWithNullName = new MockMultipartFile("fileInput", null, "application/pdf", "PDF content".getBytes());

        when(pdfDocumentFactory.load(pdfWithNullName)).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getNames()).thenReturn(null);

        ResponseEntity<byte[]> response = attachmentsController.removeAttachments(pdfWithNullName);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(mockCatalog).setPageMode(PageMode.USE_NONE);
    }
}