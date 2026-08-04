package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.SortTypes;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.SPDF.model.api.page.InsertBlankPagesRequest;
import stirling.software.SPDF.model.api.page.ReplacePagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class RearrangePagesPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Remove pages from a PDF file",
            description =
                    "This endpoint removes specified pages from a given PDF file. Users can provide"
                            + " a comma-separated list of page numbers or ranges to delete.")
    public ResponseEntity<Resource> deletePages(@ModelAttribute PDFWithPageNums request)
            throws IOException {

        MultipartFile pdfFile = request.getFileInput();
        String pagesToDelete = request.getPageNumbers();

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {

            // Split the page order string into an array of page numbers or range of numbers
            String[] pageOrderArr = pagesToDelete.split(",");

            List<Integer> pagesToRemove =
                    GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages(), false);

            Collections.sort(pagesToRemove);

            for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
                int pageIndex = pagesToRemove.get(i);
                document.removePage(pageIndex);
            }
            FormUtils.pruneOrphanedFormFields(document);
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_removed_pages.pdf"),
                    tempFileManager);
        }
    }

    private List<Integer> removeFirst(int totalPages) {
        if (totalPages <= 1) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 2; i <= totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> removeLast(int totalPages) {
        if (totalPages <= 1) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 1; i < totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> removeFirstAndLast(int totalPages) {
        if (totalPages <= 2) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 2; i < totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> reverseOrder(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = totalPages; i >= 1; i--) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> duplexSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        int half = (totalPages + 1) / 2; // This ensures proper behavior with odd numbers of pages
        for (int i = 1; i <= half; i++) {
            newPageOrder.add(i - 1);
            if (i <= totalPages - half) { // Avoid going out of bounds
                newPageOrder.add(totalPages - i);
            }
        }
        return newPageOrder;
    }

    private List<Integer> bookletSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < totalPages / 2; i++) {
            newPageOrder.add(i);
            newPageOrder.add(totalPages - i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> sideStitchBooklet(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < (totalPages + 3) / 4; i++) {
            int begin = i * 4;
            newPageOrder.add(Math.min(begin + 3, totalPages - 1));
            newPageOrder.add(Math.min(begin, totalPages - 1));
            newPageOrder.add(Math.min(begin + 1, totalPages - 1));
            newPageOrder.add(Math.min(begin + 2, totalPages - 1));
        }
        return newPageOrder;
    }

    private List<Integer> oddEvenSplit(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 1; i <= totalPages; i += 2) {
            newPageOrder.add(i - 1);
        }
        for (int i = 2; i <= totalPages; i += 2) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> duplicate(int totalPages, String pageOrder) {
        List<Integer> newPageOrder = new ArrayList<>();
        int duplicateCount;

        try {
            // Parse the duplicate count from pageOrder
            duplicateCount =
                    pageOrder != null && !pageOrder.isEmpty()
                            ? Integer.parseInt(pageOrder.trim())
                            : 2; // Default to 2 if not specified
        } catch (NumberFormatException e) {
            log.error("Invalid duplicate count specified", e);
            duplicateCount = 2; // Default to 2 if invalid input
        }

        // Validate duplicate count
        if (duplicateCount < 1) {
            duplicateCount = 2; // Default to 2 if invalid input
        }
        int maxDuplicateCount = Math.max(100, totalPages * 3);
        if (duplicateCount > maxDuplicateCount) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "duplicateCount",
                    "must not exceed " + maxDuplicateCount);
        }

        // For each page in the document
        for (int pageNum = 0; pageNum < totalPages; pageNum++) {
            // Add the current page index duplicateCount times
            for (int dupCount = 0; dupCount < duplicateCount; dupCount++) {
                newPageOrder.add(pageNum);
            }
        }

        return newPageOrder;
    }

    private List<Integer> processSortTypes(String sortTypes, int totalPages, String pageOrder) {
        try {
            SortTypes mode = SortTypes.valueOf(sortTypes.toUpperCase(Locale.ROOT));
            return switch (mode) {
                case REVERSE_ORDER -> reverseOrder(totalPages);
                case DUPLEX_SORT -> duplexSort(totalPages);
                case BOOKLET_SORT -> bookletSort(totalPages);
                case SIDE_STITCH_BOOKLET_SORT -> sideStitchBooklet(totalPages);
                case ODD_EVEN_SPLIT -> oddEvenSplit(totalPages);
                case REMOVE_FIRST -> removeFirst(totalPages);
                case REMOVE_LAST -> removeLast(totalPages);
                case REMOVE_FIRST_AND_LAST -> removeFirstAndLast(totalPages);
                case DUPLICATE -> duplicate(totalPages, pageOrder);
                default ->
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.invalidFormat",
                                "Invalid {0} format: {1}",
                                "custom mode",
                                "unsupported");
            };
        } catch (IllegalArgumentException e) {
            log.error("Unsupported custom mode", e);
            return null;
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rearrange-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Rearrange pages in a PDF file",
            description =
                    "This endpoint rearranges pages in a given PDF file based on the specified page"
                            + " order or custom mode. Users can provide a page order as a comma-separated list"
                            + " of page numbers or page ranges, or a custom mode.")
    public ResponseEntity<Resource> rearrangePages(@ModelAttribute RearrangePagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        String pageOrder = request.getPageNumbers();
        String sortType = request.getCustomMode();
        try {
            // Load the input PDF with proper resource management
            try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {

                // Split the page order string into an array of page numbers or range of numbers
                String[] pageOrderArr = pageOrder != null ? pageOrder.split(",") : new String[0];
                int totalPages = document.getNumberOfPages();
                List<Integer> newPageOrder;
                if (sortType != null
                        && !sortType.isEmpty()
                        && !"custom".equals(sortType.toLowerCase(Locale.ROOT))) {
                    newPageOrder = processSortTypes(sortType, totalPages, pageOrder);
                } else {
                    newPageOrder = GeneralUtils.parsePageList(pageOrderArr, totalPages, false);
                }
                log.info("newPageOrder = {}", newPageOrder);
                log.info("totalPages = {}", totalPages);

                // Snapshot desired pages before mutating the tree; clone repeats (e.g. DUPLICATE)
                // so each slot is a distinct node, not one PDPage under multiple /Kids.
                List<PDPage> newPages = new ArrayList<>(newPageOrder.size());
                Set<Integer> seenIndices = new HashSet<>();
                for (Integer idx : newPageOrder) {
                    PDPage page = document.getPage(idx);
                    if (!seenIndices.add(idx)) {
                        // Duplicate index: distinct page node sharing content/resources.
                        COSDictionary clonedDict = new COSDictionary();
                        clonedDict.addAll(page.getCOSObject());
                        page = new PDPage(clonedDict);
                    }
                    newPages.add(page);
                }

                // Rearrange in-place on the source document rather than copying pages into a
                // freshly-created PDDocument. Copying pages across documents triggers a PDFBox
                // 3.0.7 compressed-save regression (PDFBOX-6203, fixed for 3.0.8) where shared
                // resource objects (fonts, etc.) imported from the source can be silently
                // dropped from the output, producing pages with "font not found" errors.
                PDPageTree pages = document.getPages();
                for (int i = totalPages - 1; i >= 0; i--) {
                    pages.remove(i);
                }
                for (PDPage page : newPages) {
                    pages.add(page);
                }

                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        GeneralUtils.generateFilename(
                                pdfFile.getOriginalFilename(), "_rearranged.pdf"),
                        tempFileManager);
            }
        } catch (IOException e) {
            ExceptionUtils.logException("document rearrangement", e);
            throw e;
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/insert-blank-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Insert blank pages into a PDF file",
            description =
                    "This endpoint inserts blank pages at a specified position in a given PDF file.")
    public ResponseEntity<Resource> insertBlankPages(@ModelAttribute InsertBlankPagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        int position = request.getPosition();
        int count = request.getCount();
        String pageSize = request.getPageSize();

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            PDPageTree pages = document.getDocumentCatalog().getPages();
            
            // Parse page size
            PDRectangle rectangle = parsePageSize(pageSize);
            
            // Insert blank pages at the specified position
            for (int i = 0; i < count; i++) {
                PDPage blankPage = new PDPage(rectangle);
                pages.add(position + i, blankPage);
            }

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_blank_pages_inserted.pdf"),
                    tempFileManager);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/replace-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Replace pages in a PDF file with pages from another PDF",
            description =
                    "This endpoint replaces specific pages in a PDF file with pages from another PDF file.")
    public ResponseEntity<Resource> replacePages(@ModelAttribute ReplacePagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        MultipartFile replacementFile = request.getReplacementFile();
        List<Integer> targetIndices = request.getTargetIndices();
        List<Integer> sourceIndices = request.getSourceIndices();

        try (PDDocument document = pdfDocumentFactory.load(pdfFile);
                PDDocument replacementDocument = pdfDocumentFactory.load(replacementFile)) {

            PDPageTree pages = document.getDocumentCatalog().getPages();
            PDPageTree replacementPages = replacementDocument.getDocumentCatalog().getPages();

            // Validate indices
            if (targetIndices.size() != sourceIndices.size()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat",
                        "Target and source page counts must match");
            }

            // Remove target pages in reverse order to maintain correct indices
            Collections.sort(targetIndices, Collections.reverseOrder());
            for (Integer targetIndex : targetIndices) {
                if (targetIndex >= 0 && targetIndex < pages.getCount()) {
                    pages.remove(targetIndex);
                }
            }

            // Insert replacement pages at appropriate positions
            // Sort both lists together to maintain correspondence
            List<PageReplacement> replacements = new ArrayList<>();
            for (int i = 0; i < targetIndices.size(); i++) {
                replacements.add(new PageReplacement(targetIndices.get(i), sourceIndices.get(i)));
            }
            Collections.sort(replacements);

            int offset = 0;
            for (PageReplacement replacement : replacements) {
                int targetPos = replacement.targetIndex - offset;
                int sourceIndex = replacement.sourceIndex;
                
                if (sourceIndex >= 0 && sourceIndex < replacementPages.getCount()) {
                    PDPage sourcePage = replacementPages.get(sourceIndex);
                    COSDictionary clonedDict = new COSDictionary();
                    clonedDict.addAll(sourcePage.getCOSObject());
                    PDPage clonedPage = new PDPage(clonedDict);
                    pages.add(Math.max(0, targetPos), clonedPage);
                    offset++;
                }
            }

            FormUtils.pruneOrphanedFormFields(document);

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_pages_replaced.pdf"),
                    tempFileManager);
        }
    }

    private PDRectangle parsePageSize(String pageSize) {
        if (pageSize == null || pageSize.isEmpty()) {
            return PDRectangle.A4;
        }
        
        switch (pageSize.toUpperCase(Locale.ROOT)) {
            case "LETTER":
                return PDRectangle.LETTER;
            case "LEGAL":
                return PDRectangle.LEGAL;
            case "A3":
                return PDRectangle.A3;
            case "A5":
                return PDRectangle.A5;
            case "TABLOID":
                return PDRectangle.TABLOID;
            default:
                return PDRectangle.A4;
        }
    }

    private static class PageReplacement implements Comparable<PageReplacement> {
        int targetIndex;
        int sourceIndex;

        PageReplacement(int targetIndex, int sourceIndex) {
            this.targetIndex = targetIndex;
            this.sourceIndex = sourceIndex;
        }

        @Override
        public int compareTo(PageReplacement other) {
            return Integer.compare(this.targetIndex, other.targetIndex);
        }
    }
}
