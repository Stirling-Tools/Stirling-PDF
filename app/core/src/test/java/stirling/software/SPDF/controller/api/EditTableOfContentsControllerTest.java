package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.SPDF.controller.api.EditTableOfContentsController.BookmarkItem;
import stirling.software.SPDF.model.api.EditTableOfContentsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
@DisplayName("EditTableOfContentsController Tests")
class EditTableOfContentsControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private ObjectMapper objectMapper;

    @InjectMocks private EditTableOfContentsController editTableOfContentsController;

    private MockMultipartFile mockFile;
    private PDDocument mockDocument;
    private PDDocumentCatalog mockCatalog;
    private PDPageTree mockPages;
    private PDPage mockPage1;
    private PDPage mockPage2;
    private PDDocumentOutline mockOutline;
    private PDOutlineItem mockOutlineItem;

    @BeforeEach
    void setUp() {
        mockFile =
                new MockMultipartFile(
                        "file", "test.pdf", "application/pdf", "PDF content".getBytes());
        mockDocument = mock(PDDocument.class);
        mockCatalog = mock(PDDocumentCatalog.class);
        mockPages = mock(PDPageTree.class);
        mockPage1 = mock(PDPage.class);
        mockPage2 = mock(PDPage.class);
        mockOutline = mock(PDDocumentOutline.class);
        mockOutlineItem = mock(PDOutlineItem.class);
    }

    @Nested
    @DisplayName("Extract Bookmarks Tests")
    class ExtractBookmarksTests {

        @Test
        @DisplayName("Extracts bookmarks successfully from PDF with existing bookmarks")
        void testExtractBookmarks_WithExistingBookmarks_Success() throws Exception {
            // Arrange
            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockCatalog.getDocumentOutline()).thenReturn(mockOutline);
            when(mockOutline.getFirstChild()).thenReturn(mockOutlineItem);

            when(mockOutlineItem.getTitle()).thenReturn("Chapter 1");
            when(mockOutlineItem.findDestinationPage(mockDocument)).thenReturn(mockPage1);
            when(mockDocument.getPages()).thenReturn(mockPages);
            when(mockPages.indexOf(mockPage1)).thenReturn(0);
            when(mockOutlineItem.getFirstChild()).thenReturn(null);
            when(mockOutlineItem.getNextSibling()).thenReturn(null);

            // Act
            List<Map<String, Object>> result =
                    editTableOfContentsController.extractBookmarks(mockFile);

            // Assert
            assertNotNull(result, "Result should not be null");
            assertEquals(1, result.size(), "Result should contain one bookmark");

            Map<String, Object> bookmark = result.get(0);
            assertEquals("Chapter 1", bookmark.get("title"), "Bookmark title should match");
            assertEquals(
                    1, bookmark.get("pageNumber"), "Bookmark page number should be 1 (1-based)");
            assertInstanceOf(
                    List.class, bookmark.get("children"), "Bookmark should have children list");

            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Returns empty list when PDF has no outline")
        void testExtractBookmarks_NoOutline_ReturnsEmptyList() throws Exception {
            // Arrange
            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockCatalog.getDocumentOutline()).thenReturn(null);

            // Act
            List<Map<String, Object>> result =
                    editTableOfContentsController.extractBookmarks(mockFile);

            // Assert
            assertNotNull(result, "Result should not be null");
            assertTrue(result.isEmpty(), "Result should be empty when no outline exists");
            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Extracts nested bookmarks successfully from PDF")
        void testExtractBookmarks_WithNestedBookmarks_Success() throws Exception {
            // Arrange
            PDOutlineItem childItem = mock(PDOutlineItem.class);

            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockCatalog.getDocumentOutline()).thenReturn(mockOutline);
            when(mockOutline.getFirstChild()).thenReturn(mockOutlineItem);

            // Parent bookmark
            when(mockOutlineItem.getTitle()).thenReturn("Chapter 1");
            when(mockOutlineItem.findDestinationPage(mockDocument)).thenReturn(mockPage1);
            when(mockDocument.getPages()).thenReturn(mockPages);
            when(mockPages.indexOf(mockPage1)).thenReturn(0);
            when(mockOutlineItem.getFirstChild()).thenReturn(childItem);
            when(mockOutlineItem.getNextSibling()).thenReturn(null);

            // Child bookmark
            when(childItem.getTitle()).thenReturn("Section 1.1");
            when(childItem.findDestinationPage(mockDocument)).thenReturn(mockPage2);
            when(mockPages.indexOf(mockPage2)).thenReturn(1);
            when(childItem.getFirstChild()).thenReturn(null);
            when(childItem.getNextSibling()).thenReturn(null);

            // Act
            List<Map<String, Object>> result =
                    editTableOfContentsController.extractBookmarks(mockFile);

            // Assert
            assertNotNull(result, "Result should not be null");
            assertEquals(1, result.size(), "Result should contain one parent bookmark");

            Map<String, Object> parentBookmark = result.get(0);
            assertEquals(
                    "Chapter 1", parentBookmark.get("title"), "Parent bookmark title should match");
            assertEquals(
                    1, parentBookmark.get("pageNumber"), "Parent bookmark page number should be 1");

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> children =
                    (List<Map<String, Object>>) parentBookmark.get("children");
            assertEquals(1, children.size(), "Parent should have one child bookmark");

            Map<String, Object> childBookmark = children.get(0);
            assertEquals(
                    "Section 1.1", childBookmark.get("title"), "Child bookmark title should match");
            assertEquals(
                    2, childBookmark.get("pageNumber"), "Child bookmark page number should be 2");

            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Defaults to page 1 when bookmark page is not found")
        void testExtractBookmarks_PageNotFound_UsesPageOne() throws Exception {
            // Arrange
            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockCatalog.getDocumentOutline()).thenReturn(mockOutline);
            when(mockOutline.getFirstChild()).thenReturn(mockOutlineItem);

            when(mockOutlineItem.getTitle()).thenReturn("Chapter 1");
            when(mockOutlineItem.findDestinationPage(mockDocument))
                    .thenReturn(null); // Page not found
            when(mockOutlineItem.getFirstChild()).thenReturn(null);
            when(mockOutlineItem.getNextSibling()).thenReturn(null);

            // Act
            List<Map<String, Object>> result =
                    editTableOfContentsController.extractBookmarks(mockFile);

            // Assert
            assertNotNull(result, "Result should not be null");
            assertEquals(1, result.size(), "Result should contain one bookmark");

            Map<String, Object> bookmark = result.get(0);
            assertEquals("Chapter 1", bookmark.get("title"), "Bookmark title should match");
            assertEquals(1, bookmark.get("pageNumber"), "Bookmark page number should default to 1");

            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Throws exception when IOException occurs during PDF loading")
        void testExtractBookmarks_IOExceptionDuringLoad_ThrowsException() throws Exception {
            // Arrange
            when(pdfDocumentFactory.load(mockFile))
                    .thenThrow(new RuntimeException("Failed to load PDF"));

            // Act & Assert
            assertThrows(
                    RuntimeException.class,
                    () -> editTableOfContentsController.extractBookmarks(mockFile),
                    "Should throw RuntimeException when loading fails");
        }
    }

    @Nested
    @DisplayName("Edit Table of Contents Tests")
    class EditTableOfContentsTests {

        @Test
        @DisplayName("Successfully edits table of contents in PDF")
        void testEditTableOfContents_Success() throws Exception {
            // Arrange
            EditTableOfContentsRequest request = new EditTableOfContentsRequest();
            request.setFileInput(mockFile);
            request.setBookmarkData("[{\"title\":\"Chapter 1\",\"pageNumber\":1,\"children\":[]}]");
            request.setReplaceExisting(true);

            List<BookmarkItem> bookmarks = new ArrayList<>();
            BookmarkItem bookmark = new BookmarkItem();
            bookmark.setTitle("Chapter 1");
            bookmark.setPageNumber(1);
            bookmark.setChildren(new ArrayList<>());
            bookmarks.add(bookmark);

            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(objectMapper.readValue(eq(request.getBookmarkData()), any(TypeReference.class)))
                    .thenReturn(bookmarks);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockDocument.getNumberOfPages()).thenReturn(5);
            when(mockDocument.getPage(0)).thenReturn(mockPage1);

            // Mock saving behavior
            doAnswer(
                            invocation -> {
                                ByteArrayOutputStream baos = invocation.getArgument(0);
                                baos.write("mocked pdf content".getBytes());
                                return null;
                            })
                    .when(mockDocument)
                    .save(any(ByteArrayOutputStream.class));

            // Act
            ResponseEntity<byte[]> result =
                    editTableOfContentsController.editTableOfContents(request);

            // Assert
            assertNotNull(result, "Result should not be null");
            assertNotNull(result.getBody(), "Response body should not be null");

            ArgumentCaptor<PDDocumentOutline> outlineCaptor =
                    ArgumentCaptor.forClass(PDDocumentOutline.class);
            verify(mockCatalog).setDocumentOutline(outlineCaptor.capture());

            PDDocumentOutline capturedOutline = outlineCaptor.getValue();
            assertNotNull(capturedOutline, "Outline should be set in catalog");

            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Successfully edits table of contents with nested bookmarks")
        void testEditTableOfContents_WithNestedBookmarks_Success() throws Exception {
            // Arrange
            EditTableOfContentsRequest request = new EditTableOfContentsRequest();
            request.setFileInput(mockFile);

            String bookmarkJson =
                    "[{\"title\":\"Chapter 1\",\"pageNumber\":1,\"children\":[{\"title\":\"Section 1.1\",\"pageNumber\":2,\"children\":[]}]}]";
            request.setBookmarkData(bookmarkJson);

            List<BookmarkItem> bookmarks = new ArrayList<>();
            BookmarkItem parentBookmark = new BookmarkItem();
            parentBookmark.setTitle("Chapter 1");
            parentBookmark.setPageNumber(1);

            BookmarkItem childBookmark = new BookmarkItem();
            childBookmark.setTitle("Section 1.1");
            childBookmark.setPageNumber(2);
            childBookmark.setChildren(new ArrayList<>());

            List<BookmarkItem> children = new ArrayList<>();
            children.add(childBookmark);
            parentBookmark.setChildren(children);
            bookmarks.add(parentBookmark);

            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(objectMapper.readValue(eq(bookmarkJson), any(TypeReference.class)))
                    .thenReturn(bookmarks);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockDocument.getNumberOfPages()).thenReturn(5);
            when(mockDocument.getPage(0)).thenReturn(mockPage1);
            when(mockDocument.getPage(1)).thenReturn(mockPage2);

            doAnswer(
                            invocation -> {
                                ByteArrayOutputStream baos = invocation.getArgument(0);
                                baos.write("mocked pdf content".getBytes());
                                return null;
                            })
                    .when(mockDocument)
                    .save(any(ByteArrayOutputStream.class));

            // Act
            ResponseEntity<byte[]> result =
                    editTableOfContentsController.editTableOfContents(request);

            // Assert
            assertNotNull(result, "Result should not be null");
            verify(mockCatalog).setDocumentOutline(any(PDDocumentOutline.class));
            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Clamps page numbers to valid bounds when editing table of contents")
        void testEditTableOfContents_PageNumberBounds_ClampsValues() throws Exception {
            // Arrange
            EditTableOfContentsRequest request = new EditTableOfContentsRequest();
            request.setFileInput(mockFile);
            request.setBookmarkData(
                    "[{\"title\":\"Chapter 1\",\"pageNumber\":-5,\"children\":[]},{\"title\":\"Chapter 2\",\"pageNumber\":100,\"children\":[]}]");

            List<BookmarkItem> bookmarks = new ArrayList<>();

            BookmarkItem bookmark1 = new BookmarkItem();
            bookmark1.setTitle("Chapter 1");
            bookmark1.setPageNumber(-5); // Negative page number
            bookmark1.setChildren(new ArrayList<>());

            BookmarkItem bookmark2 = new BookmarkItem();
            bookmark2.setTitle("Chapter 2");
            bookmark2.setPageNumber(100); // Page number exceeds document pages
            bookmark2.setChildren(new ArrayList<>());

            bookmarks.add(bookmark1);
            bookmarks.add(bookmark2);

            when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDocument);
            when(objectMapper.readValue(eq(request.getBookmarkData()), any(TypeReference.class)))
                    .thenReturn(bookmarks);
            when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
            when(mockDocument.getNumberOfPages()).thenReturn(5);
            when(mockDocument.getPage(0)).thenReturn(mockPage1); // For negative page number
            when(mockDocument.getPage(4)).thenReturn(mockPage2); // For page number exceeding bounds

            doAnswer(
                            invocation -> {
                                ByteArrayOutputStream baos = invocation.getArgument(0);
                                baos.write("mocked pdf content".getBytes());
                                return null;
                            })
                    .when(mockDocument)
                    .save(any(ByteArrayOutputStream.class));

            // Act
            ResponseEntity<byte[]> result =
                    editTableOfContentsController.editTableOfContents(request);

            // Assert
            assertNotNull(result, "Result should not be null");
            verify(mockDocument).getPage(0); // Clamped to first page
            verify(mockDocument).getPage(4); // Clamped to last page
            verify(mockDocument).close();
        }

        @Test
        @DisplayName("Throws exception when IOException occurs during PDF loading for edit")
        void testEditTableOfContents_IOExceptionDuringLoad_ThrowsException() throws Exception {
            // Arrange
            EditTableOfContentsRequest request = new EditTableOfContentsRequest();
            request.setFileInput(mockFile);

            when(pdfDocumentFactory.load(mockFile))
                    .thenThrow(new RuntimeException("Failed to load PDF"));

            // Act & Assert
            assertThrows(
                    RuntimeException.class,
                    () -> editTableOfContentsController.editTableOfContents(request),
                    "Should throw RuntimeException when loading fails");
        }
    }

    @Nested
    @DisplayName("BookmarkItem and Utility Method Tests")
    class BookmarkItemAndUtilityTests {

        @Test
        @DisplayName("Creates outline item successfully with valid page number")
        void testCreateOutlineItem_ValidPageNumber_Success() throws Exception {
            // Arrange
            BookmarkItem bookmark = new BookmarkItem();
            bookmark.setTitle("Test Chapter");
            bookmark.setPageNumber(3);

            when(mockDocument.getNumberOfPages()).thenReturn(5);
            when(mockDocument.getPage(2)).thenReturn(mockPage1); // 0-indexed

            // Act
            Method createOutlineItemMethod =
                    EditTableOfContentsController.class.getDeclaredMethod(
                            "createOutlineItem", PDDocument.class, BookmarkItem.class);
            createOutlineItemMethod.setAccessible(true);
            PDOutlineItem result =
                    (PDOutlineItem)
                            createOutlineItemMethod.invoke(
                                    editTableOfContentsController, mockDocument, bookmark);

            // Assert
            assertNotNull(result, "Outline item should not be null");
            verify(mockDocument).getPage(2);
        }

        @Test
        @DisplayName("BookmarkItem getters and setters work correctly")
        void testBookmarkItem_GettersAndSetters() {
            // Arrange
            BookmarkItem bookmark = new BookmarkItem();
            List<BookmarkItem> children = new ArrayList<>();

            // Act
            bookmark.setTitle("Test Title");
            bookmark.setPageNumber(5);
            bookmark.setChildren(children);

            // Assert
            assertEquals("Test Title", bookmark.getTitle(), "Title should match set value");
            assertEquals(5, bookmark.getPageNumber(), "Page number should match set value");
            assertEquals(children, bookmark.getChildren(), "Children list should match set value");
        }
    }
}
