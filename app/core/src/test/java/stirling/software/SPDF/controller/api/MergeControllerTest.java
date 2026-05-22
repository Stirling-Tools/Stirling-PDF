package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
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
import org.springframework.http.MediaType;
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
    private PDDocument mockMergedDocument;
    private PDDocumentCatalog mockCatalog;
    private PDPage mockPage1;
    private PDPage mockPage2;

    @BeforeEach
    void setUp() {
        mockFile1 =
                new MockMultipartFile(
                        "file1",
                        "document1.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content 1".getBytes());
        mockFile2 =
                new MockMultipartFile(
                        "file2",
                        "document2.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content 2".getBytes());
        mockFile3 =
                new MockMultipartFile(
                        "file3",
                        "chapter3.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content 3".getBytes());

        PDDocument mockDocument = mock(PDDocument.class);
        mockMergedDocument = mock(PDDocument.class);
        mockCatalog = mock(PDDocumentCatalog.class);
        PDPageTree mockPages = mock(PDPageTree.class);
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

        when(pdfDocumentFactory.pageCountFast(mockFile1)).thenReturn(2);
        when(pdfDocumentFactory.pageCountFast(mockFile2)).thenReturn(2);
        when(pdfDocumentFactory.pageCountFast(mockFile3)).thenReturn(2);

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

        verify(pdfDocumentFactory).pageCountFast(mockFile1);
        verify(pdfDocumentFactory).pageCountFast(mockFile2);
        verify(pdfDocumentFactory).pageCountFast(mockFile3);
    }

    @Test
    void testAddTableOfContents_WithSingleFile_Success() throws Exception {
        // Given
        MultipartFile[] files = {mockFile1};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(3);
        when(mockMergedDocument.getPage(0)).thenReturn(mockPage1);

        when(pdfDocumentFactory.pageCountFast(mockFile1)).thenReturn(3);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);
        addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files);

        // Then
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verify(pdfDocumentFactory).pageCountFast(mockFile1);
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

        when(pdfDocumentFactory.pageCountFast(mockFile1)).thenReturn(2);
        when(pdfDocumentFactory.pageCountFast(mockFile2))
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
        verify(pdfDocumentFactory).pageCountFast(mockFile1);
        verify(pdfDocumentFactory).pageCountFast(mockFile2);
    }

    @Test
    void testAddTableOfContents_FilenameWithoutExtension_UsesFullName() throws Exception {
        // Given
        MockMultipartFile fileWithoutExtension =
                new MockMultipartFile(
                        "file",
                        "document_no_ext",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content".getBytes());
        MultipartFile[] files = {fileWithoutExtension};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(1);
        when(mockMergedDocument.getPage(0)).thenReturn(mockPage1);

        when(pdfDocumentFactory.pageCountFast(fileWithoutExtension)).thenReturn(1);

        // When
        Method addTableOfContentsMethod =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        addTableOfContentsMethod.setAccessible(true);
        addTableOfContentsMethod.invoke(mergeController, mockMergedDocument, files);

        // Then
        verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
        verify(pdfDocumentFactory).pageCountFast(fileWithoutExtension);
    }

    @Test
    void testAddTableOfContents_PageIndexExceedsDocumentPages_HandlesGracefully() throws Exception {
        // Given
        MultipartFile[] files = {mockFile1};

        when(mockMergedDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockMergedDocument.getNumberOfPages()).thenReturn(0); // No pages in merged document

        when(pdfDocumentFactory.pageCountFast(mockFile1)).thenReturn(3);

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
        when(pages1.iterator()).thenReturn(Collections.singletonList(page1).iterator());
        when(pages2.iterator()).thenReturn(Collections.singletonList(page2).iterator());

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
        List<PDDocument> documents = List.of();

        when(pdfDocumentFactory.createNewDocument()).thenReturn(mockMergedDocument);

        // When
        PDDocument result = mergeController.mergeDocuments(documents);

        // Then
        assertNotNull(result);
        assertEquals(mockMergedDocument, result);
        verify(mockMergedDocument, never()).addPage(any(PDPage.class));
    }
}
