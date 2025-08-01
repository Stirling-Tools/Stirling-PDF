package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class MergeControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private MergeController mergeController;

    private MockMultipartFile mockFile1;
    private MockMultipartFile mockFile2;
    private MockMultipartFile mockFile3;
    private PDDocument mockDocument;
    private PDDocument mockMergedDocument;
    private PDDocumentCatalog mockCatalog;
    private PDPageTree mockPages;
    private PDPage mockPage1;
    private PDPage mockPage2;

    @BeforeEach
    void setUp() {
        mockFile1 =
                new MockMultipartFile(
                        "file1", "document1.pdf", "application/pdf", "PDF content 1".getBytes());
        mockFile2 =
                new MockMultipartFile(
                        "file2", "document2.pdf", "application/pdf", "PDF content 2".getBytes());
        mockFile3 =
                new MockMultipartFile(
                        "file3", "chapter3.pdf", "application/pdf", "PDF content 3".getBytes());

        mockDocument = mock(PDDocument.class);
        mockMergedDocument = mock(PDDocument.class);
        mockCatalog = mock(PDDocumentCatalog.class);
        mockPages = mock(PDPageTree.class);
        mockPage1 = mock(PDPage.class);
        mockPage2 = mock(PDPage.class);
    }

    @Test
    void testAddTableOfContents_WithMultipleFiles_Success() throws Exception {
        // Given
        MultipartFile[] files = {mockFile1, mockFile2, mockFile3};

        // Mock the merged document setup
        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(6);
        when(mockMergedDocument.getPage(0)).thenReturn(mockPage1);
        when(mockMergedDocument.getPage(2)).thenReturn(mockPage2);
        when(mockMergedDocument.getPage(4)).thenReturn(mockPage1);

        // Mock individual document loading for page count
        PDDocument doc1 = mock(PDDocument.class);
        PDDocument doc2 = mock(PDDocument.class);
        PDDocument doc3 = mock(PDDocument.class);

        when(pdfDocumentFactory.load(mockFile1)).thenReturn(doc1);
        when(pdfDocumentFactory.load(mockFile2)).thenReturn(doc2);
        when(pdfDocumentFactory.load(mockFile3)).thenReturn(doc3);

        when(doc1.getNumberOfPages()).thenReturn(2);
        when(doc2.getNumberOfPages()).thenReturn(2);
        when(doc3.getNumberOfPages()).thenReturn(2);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);
        addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files);

        // Then
        ArgumentCaptor<PDDocumentOutline> outlineCaptor =
                ArgumentCaptor.forClass(PDDocumentOutline.class);
        verify(mockCatalog).setDocumentOutline(outlineCaptor.capture());

        PDDocumentOutline capturedOutline = outlineCaptor.getValue();
        assertNotNull(capturedOutline);

        // Verify that documents were loaded for page count
        verify(pdfDocumentFactory).load(mockFile1);
        verify(pdfDocumentFactory).load(mockFile2);
        verify(pdfDocumentFactory).load(mockFile3);

        // Verify document closing
        verify(doc1).close();
        verify(doc2).close();
        verify(doc3).close();
    }

    @Test
    void testAddTableOfContents_WithSingleFile_Success() throws Exception {
        // Given
        MultipartFile[] files = {mockFile1};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(3);
        when(mockMergedDocument.getPage(0)).thenReturn(mockPage1);

        PDDocument doc1 = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile1)).thenReturn(doc1);
        when(doc1.getNumberOfPages()).thenReturn(3);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);
        addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files);

        // Then
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verify(pdfDocumentFactory).load(mockFile1);
        verify(doc1).close();
    }

    @Test
    void testAddTableOfContents_WithEmptyArray_Success() throws Exception {
        // Given
        MultipartFile[] files = {};
        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);
        addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files);

        // Then
        verify(mockMergedDocument).getDocumentCatalog();
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verifyNoInteractions(pdfDocumentFactory);
    }

    @Test
    void testAddTableOfContents_WithIOException_HandlesGracefully() throws Exception {
        // Given
        MultipartFile[] files = {mockFile1, mockFile2};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(4);
        when(mockMergedDocument.getPage(anyInt()))
                .thenReturn(mockPage1); // Use anyInt() to avoid stubbing conflicts

        // First document loads successfully
        PDDocument doc1 = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile1)).thenReturn(doc1);
        when(doc1.getNumberOfPages()).thenReturn(2);

        // Second document throws IOException
        when(pdfDocumentFactory.load(mockFile2))
                .thenThrow(new IOException("Failed to load document"));

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);

        // Should not throw exception
        assertDoesNotThrow(
                () -> addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files));

        // Then
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verify(pdfDocumentFactory).load(mockFile1);
        verify(pdfDocumentFactory).load(mockFile2);
        verify(doc1).close();
    }

    @Test
    void testAddTableOfContents_FilenameWithoutExtension_UsesFullName() throws Exception {
        // Given
        MockMultipartFile fileWithoutExtension =
                new MockMultipartFile(
                        "file", "document_no_ext", "application/pdf", "PDF content".getBytes());
        MultipartFile[] files = {fileWithoutExtension};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(1);
        when(mockMergedDocument.getPage(0)).thenReturn(mockPage1);

        PDDocument doc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(fileWithoutExtension)).thenReturn(doc);
        when(doc.getNumberOfPages()).thenReturn(1);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);
        addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files);

        // Then
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verify(doc).close();
    }

    @Test
    void testAddTableOfContents_PageIndexExceedsDocumentPages_HandlesGracefully() throws Exception {
        // Given
        MultipartFile[] files = {mockFile1};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(0); // No pages in merged document

        PDDocument doc1 = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile1)).thenReturn(doc1);
        when(doc1.getNumberOfPages()).thenReturn(3);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);

        // Should not throw exception
        assertDoesNotThrow(
                () -> addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files));

        // Then
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verify(mockMergedDocument, never()).getPage(anyInt());
        verify(doc1).close();
    }

    @Test
    void testMergeDocuments_Success() throws IOException {
        // Given
        PDDocument doc1 = mock(PDDocument.class);
        PDDocument doc2 = mock(PDDocument.class);
        List<PDDocument> documents = Arrays.asList(doc1, doc2);

        PDPageTree pages1 = mock(PDPageTree.class);
        PDPageTree pages2 = mock(PDPageTree.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);

        when(pdfDocumentFactory.createNewDocument()).thenReturn(mockMergedDocument);
        when(doc1.getPages()).thenReturn(pages1);
        when(doc2.getPages()).thenReturn(pages2);
        when(pages1.iterator()).thenReturn(Arrays.asList(page1).iterator());
        when(pages2.iterator()).thenReturn(Arrays.asList(page2).iterator());

        // When
        PDDocument result = mergeController.mergeDocuments(documents);

        // Then
        assertNotNull(result);
        assertEquals(mockMergedDocument, result);
        verify(mockMergedDocument).addPage(page1);
        verify(mockMergedDocument).addPage(page2);
    }

    @Test
    void testMergeDocuments_EmptyList_ReturnsEmptyDocument() throws IOException {
        // Given
        List<PDDocument> documents = Arrays.asList();

        when(pdfDocumentFactory.createNewDocument()).thenReturn(mockMergedDocument);

        // When
        PDDocument result = mergeController.mergeDocuments(documents);

        // Then
        assertNotNull(result);
        assertEquals(mockMergedDocument, result);
        verify(mockMergedDocument, never()).addPage(any(PDPage.class));
    }
}
