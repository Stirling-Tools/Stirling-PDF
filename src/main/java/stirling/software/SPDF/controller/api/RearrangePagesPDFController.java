package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import stirling.software.SPDF.utils.PdfUtils;

@RestController
public class RearrangePagesPDFController {

    private static final Logger logger = LoggerFactory.getLogger(RearrangePagesPDFController.class);


    @PostMapping(consumes = "multipart/form-data", value = "/remove-pages")
    @Operation(summary = "Remove pages from a PDF file",
            description = "This endpoint removes specified pages from a given PDF file. Users can provide a comma-separated list of page numbers or ranges to delete.")
    public ResponseEntity<byte[]> deletePages(
            @RequestPart(required = true, value = "fileInput")
            @Parameter(description = "The input PDF file from which pages will be removed")
                    MultipartFile pdfFile,
            @RequestParam("pagesToDelete")
            @Parameter(description = "Comma-separated list of pages or page ranges to delete, e.g., '1,3,5-8'")
                    String pagesToDelete) throws IOException {

        PDDocument document = PDDocument.load(pdfFile.getBytes());

        // Split the page order string into an array of page numbers or range of numbers
        String[] pageOrderArr = pagesToDelete.split(",");

        List<Integer> pagesToRemove = pageOrderToString(pageOrderArr, document.getNumberOfPages());

        for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
            int pageIndex = pagesToRemove.get(i);
            document.removePage(pageIndex);
        }
        return PdfUtils.pdfDocToWebResponse(document, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_removed_pages.pdf");

    }

    private List<Integer> pageOrderToString(String[] pageOrderArr, int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        // loop through the page order array
        for (String element : pageOrderArr) {
            // check if the element contains a range of pages
            if (element.contains("-")) {
                // split the range into start and end page
                String[] range = element.split("-");
                int start = Integer.parseInt(range[0]);
                int end = Integer.parseInt(range[1]);
                // check if the end page is greater than total pages
                if (end > totalPages) {
                    end = totalPages;
                }
                // loop through the range of pages
                for (int j = start; j <= end; j++) {
                    // print the current index
                    newPageOrder.add(j - 1);
                }
            } else {
                // if the element is a single page
                newPageOrder.add(Integer.parseInt(element) - 1);
            }
        }

        return newPageOrder;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/rearrange-pages")
    @Operation(summary = "Rearrange pages in a PDF file",
            description = "This endpoint rearranges pages in a given PDF file based on the specified page order. Users can provide a page order as a comma-separated list of page numbers or page ranges.")
    public ResponseEntity<byte[]> rearrangePages(
            @RequestPart(required = true, value = "fileInput")
            @Parameter(description = "The input PDF file to rearrange pages")
                    MultipartFile pdfFile,
            @RequestParam("pageOrder")
            @Parameter(description = "The new page order as a comma-separated list of page numbers or page ranges (e.g., '1,3,5-7')")
                    String pageOrder) {
        try {
            // Load the input PDF
            PDDocument document = PDDocument.load(pdfFile.getInputStream());

            // Split the page order string into an array of page numbers or range of numbers
            String[] pageOrderArr = pageOrder.split(",");
            // int[] newPageOrder = new int[pageOrderArr.length];
            int totalPages = document.getNumberOfPages();

            List<Integer> newPageOrder = pageOrderToString(pageOrderArr, totalPages);

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

            return PdfUtils.pdfDocToWebResponse(document, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_rearranged.pdf");
        } catch (IOException e) {

            logger.error("Failed rearranging documents", e);
            return null;
        }
    }

}
