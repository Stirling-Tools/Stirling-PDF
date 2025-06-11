package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.EditTableOfContentsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Slf4j
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class EditTableOfContentsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    @PostMapping(value = "/extract-bookmarks", consumes = "multipart/form-data")
    @Operation(
            summary = "Extract PDF Bookmarks",
            description = "Extracts bookmarks/table of contents from a PDF document as JSON.")
    @ResponseBody
    public List<Map<String, Object>> extractBookmarks(@RequestParam("file") MultipartFile file)
            throws Exception {
        PDDocument document = null;
        try {
            document = pdfDocumentFactory.load(file);
            PDDocumentOutline outline = document.getDocumentCatalog().getDocumentOutline();

            if (outline == null) {
                log.info("No outline/bookmarks found in PDF");
                return new ArrayList<>();
            }

            return extractBookmarkItems(document, outline);
        } finally {
            if (document != null) {
                document.close();
            }
        }
    }

    private List<Map<String, Object>> extractBookmarkItems(
            PDDocument document, PDDocumentOutline outline) throws Exception {
        List<Map<String, Object>> bookmarks = new ArrayList<>();
        PDOutlineItem current = outline.getFirstChild();

        while (current != null) {
            Map<String, Object> bookmark = new HashMap<>();

            // Get bookmark title
            String title = current.getTitle();
            bookmark.put("title", title);

            // Get page number (1-based for UI purposes)
            PDPage page = current.findDestinationPage(document);
            if (page != null) {
                int pageIndex = document.getPages().indexOf(page);
                bookmark.put("pageNumber", pageIndex + 1);
            } else {
                bookmark.put("pageNumber", 1);
            }

            // Process children if any
            PDOutlineItem child = current.getFirstChild();
            if (child != null) {
                List<Map<String, Object>> children = new ArrayList<>();
                PDOutlineNode parent = current;

                while (child != null) {
                    // Recursively process child items
                    Map<String, Object> childBookmark = processChild(document, child);
                    children.add(childBookmark);
                    child = child.getNextSibling();
                }

                bookmark.put("children", children);
            } else {
                bookmark.put("children", new ArrayList<>());
            }

            bookmarks.add(bookmark);
            current = current.getNextSibling();
        }

        return bookmarks;
    }

    private Map<String, Object> processChild(PDDocument document, PDOutlineItem item)
            throws Exception {
        Map<String, Object> bookmark = new HashMap<>();

        // Get bookmark title
        String title = item.getTitle();
        bookmark.put("title", title);

        // Get page number (1-based for UI purposes)
        PDPage page = item.findDestinationPage(document);
        if (page != null) {
            int pageIndex = document.getPages().indexOf(page);
            bookmark.put("pageNumber", pageIndex + 1);
        } else {
            bookmark.put("pageNumber", 1);
        }

        // Process children if any
        PDOutlineItem child = item.getFirstChild();
        if (child != null) {
            List<Map<String, Object>> children = new ArrayList<>();

            while (child != null) {
                // Recursively process child items
                Map<String, Object> childBookmark = processChild(document, child);
                children.add(childBookmark);
                child = child.getNextSibling();
            }

            bookmark.put("children", children);
        } else {
            bookmark.put("children", new ArrayList<>());
        }

        return bookmark;
    }

    @PostMapping(value = "/edit-table-of-contents", consumes = "multipart/form-data")
    @Operation(
            summary = "Edit Table of Contents",
            description = "Add or edit bookmarks/table of contents in a PDF document.")
    public ResponseEntity<byte[]> editTableOfContents(
            @ModelAttribute EditTableOfContentsRequest request) throws Exception {
        MultipartFile file = request.getFileInput();
        PDDocument document = null;

        try {
            document = pdfDocumentFactory.load(file);

            // Parse the bookmark data from JSON
            List<BookmarkItem> bookmarks =
                    objectMapper.readValue(
                            request.getBookmarkData(), new TypeReference<List<BookmarkItem>>() {});

            // Create a new document outline
            PDDocumentOutline outline = new PDDocumentOutline();
            document.getDocumentCatalog().setDocumentOutline(outline);

            // Add bookmarks to the outline
            addBookmarksToOutline(document, outline, bookmarks);

            // Save the document to a byte array
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);

            String filename = file.getOriginalFilename().replaceFirst("[.][^.]+$", "");
            return WebResponseUtils.bytesToWebResponse(
                    baos.toByteArray(), filename + "_with_toc.pdf", MediaType.APPLICATION_PDF);

        } finally {
            if (document != null) {
                document.close();
            }
        }
    }

    private void addBookmarksToOutline(
            PDDocument document, PDDocumentOutline outline, List<BookmarkItem> bookmarks) {
        for (BookmarkItem bookmark : bookmarks) {
            PDOutlineItem item = createOutlineItem(document, bookmark);
            outline.addLast(item);

            if (bookmark.getChildren() != null && !bookmark.getChildren().isEmpty()) {
                addChildBookmarks(document, item, bookmark.getChildren());
            }
        }
    }

    private void addChildBookmarks(
            PDDocument document, PDOutlineItem parent, List<BookmarkItem> children) {
        for (BookmarkItem child : children) {
            PDOutlineItem item = createOutlineItem(document, child);
            parent.addLast(item);

            if (child.getChildren() != null && !child.getChildren().isEmpty()) {
                addChildBookmarks(document, item, child.getChildren());
            }
        }
    }

    private PDOutlineItem createOutlineItem(PDDocument document, BookmarkItem bookmark) {
        PDOutlineItem item = new PDOutlineItem();
        item.setTitle(bookmark.getTitle());

        // Get the target page - adjust for 0-indexed pages in PDFBox
        int pageIndex = bookmark.getPageNumber() - 1;
        if (pageIndex < 0) {
            pageIndex = 0;
        } else if (pageIndex >= document.getNumberOfPages()) {
            pageIndex = document.getNumberOfPages() - 1;
        }

        PDPage page = document.getPage(pageIndex);
        item.setDestination(page);

        return item;
    }

    // Inner class to represent bookmarks in JSON
    public static class BookmarkItem {
        private String title;
        private int pageNumber;
        private List<BookmarkItem> children = new ArrayList<>();

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public int getPageNumber() {
            return pageNumber;
        }

        public void setPageNumber(int pageNumber) {
            this.pageNumber = pageNumber;
        }

        public List<BookmarkItem> getChildren() {
            return children;
        }

        public void setChildren(List<BookmarkItem> children) {
            this.children = children;
        }
    }
}
