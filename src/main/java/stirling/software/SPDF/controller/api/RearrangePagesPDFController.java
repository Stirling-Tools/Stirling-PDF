package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.SortTypes;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class RearrangePagesPDFController {

    private static final Logger logger = LoggerFactory.getLogger(RearrangePagesPDFController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/remove-pages")
    @Operation(
            summary = "Remove pages from a PDF file",
            description =
                    "This endpoint removes specified pages from a given PDF file. Users can provide a comma-separated list of page numbers or ranges to delete. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> deletePages(@ModelAttribute PDFWithPageNums request)
            throws IOException {

        MultipartFile pdfFile = request.getFileInput();
        String pagesToDelete = request.getPageNumbers();

        PDDocument document = Loader.loadPDF(pdfFile.getBytes());

        // Split the page order string into an array of page numbers or range of numbers
        String[] pageOrderArr = pagesToDelete.split(",");

        List<Integer> pagesToRemove =
                GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages(), false);

        Collections.sort(pagesToRemove);

        for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
            int pageIndex = pagesToRemove.get(i);
            document.removePage(pageIndex);
        }
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_removed_pages.pdf");
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

    /**
     * Rearrange pages in a PDF file by merging odd and even pages. The first half of the pages will
     * be the odd pages, and the second half will be the even pages as input. <br>
     * This method is visible for testing purposes only.
     *
     * @param totalPages Total number of pages in the PDF file.
     * @return List of page numbers in the new order. The first page is 0.
     */
    List<Integer> oddEvenMerge(int totalPages) {
        List<Integer> newPageOrderZeroBased = new ArrayList<>();
        int numberOfOddPages = (totalPages + 1) / 2;

        for (int oneBasedIndex = 1; oneBasedIndex < (numberOfOddPages + 1); oneBasedIndex++) {
            newPageOrderZeroBased.add((oneBasedIndex - 1));
            if (numberOfOddPages + oneBasedIndex <= totalPages) {
                newPageOrderZeroBased.add((numberOfOddPages + oneBasedIndex - 1));
            }
        }

        return newPageOrderZeroBased;
    }

    private List<Integer> processSortTypes(String sortTypes, int totalPages) {
        try {
            SortTypes mode = SortTypes.valueOf(sortTypes.toUpperCase());
            switch (mode) {
                case REVERSE_ORDER:
                    return reverseOrder(totalPages);
                case DUPLEX_SORT:
                    return duplexSort(totalPages);
                case BOOKLET_SORT:
                    return bookletSort(totalPages);
                case SIDE_STITCH_BOOKLET_SORT:
                    return sideStitchBooklet(totalPages);
                case ODD_EVEN_SPLIT:
                    return oddEvenSplit(totalPages);
                case ODD_EVEN_MERGE:
                    return oddEvenMerge(totalPages);
                case REMOVE_FIRST:
                    return removeFirst(totalPages);
                case REMOVE_LAST:
                    return removeLast(totalPages);
                case REMOVE_FIRST_AND_LAST:
                    return removeFirstAndLast(totalPages);
                default:
                    throw new IllegalArgumentException("Unsupported custom mode");
            }
        } catch (IllegalArgumentException e) {
            logger.error("Unsupported custom mode", e);
            return null;
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/rearrange-pages")
    @Operation(
            summary = "Rearrange pages in a PDF file",
            description =
                    "This endpoint rearranges pages in a given PDF file based on the specified page order or custom mode. Users can provide a page order as a comma-separated list of page numbers or page ranges, or a custom mode. Input:PDF Output:PDF")
    public ResponseEntity<byte[]> rearrangePages(@ModelAttribute RearrangePagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        String pageOrder = request.getPageNumbers();
        String sortType = request.getCustomMode();
        try {
            // Load the input PDF
            PDDocument document = Loader.loadPDF(pdfFile.getBytes());

            // Split the page order string into an array of page numbers or range of numbers
            String[] pageOrderArr = pageOrder != null ? pageOrder.split(",") : new String[0];
            int totalPages = document.getNumberOfPages();
            List<Integer> newPageOrder;
            if (sortType != null && sortType.length() > 0) {
                newPageOrder = processSortTypes(sortType, totalPages);
            } else {
                newPageOrder = GeneralUtils.parsePageList(pageOrderArr, totalPages, false);
            }
            logger.info("newPageOrder = " + newPageOrder);
            logger.info("totalPages = " + totalPages);
            // Create a new list to hold the pages in the new order
            List<PDPage> newPages = new ArrayList<>();
            for (int i = 0; i < newPageOrder.size(); i++) {
                newPages.add(document.getPage(newPageOrder.get(i)));
            }

            // Remove all the pages from the original document
            for (int i = document.getNumberOfPages() - 1; i >= 0; i--) {
                document.removePage(i);
            }

            // Add the pages in the new order
            for (PDPage page : newPages) {
                document.addPage(page);
            }

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_rearranged.pdf");
        } catch (IOException e) {
            logger.error("Failed rearranging documents", e);
            return null;
        }
    }
}
