package stirling.software.SPDF.controller.api.filters;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.PDFComparisonAndCount;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.filter.ContainsTextRequest;
import stirling.software.SPDF.model.api.filter.FileSizeRequest;
import stirling.software.SPDF.model.api.filter.PageRotationRequest;
import stirling.software.SPDF.model.api.filter.PageSizeRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/filter")
@Tag(name = "Filter", description = "Filter APIs")
@RequiredArgsConstructor
public class FilterController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/filter-contains-text")
    @Operation(
            summary = "Checks if a PDF contains set text, returns true if does",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = MediaType.APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public ResponseEntity<byte[]> containsText(@ModelAttribute ContainsTextRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        String text = request.getText();
        String pageNumber = request.getPageNumbers();

        try (PDDocument pdfDocument = pdfDocumentFactory.load(inputFile)) {
            if (PdfUtils.hasText(pdfDocument, pageNumber, text)) {
                return WebResponseUtils.pdfDocToWebResponse(
                        pdfDocument, Filenames.toSimpleFileName(inputFile.getOriginalFilename()));
            }
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/filter-contains-image")
    @Operation(
            summary = "Checks if a PDF contains an image",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = MediaType.APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public ResponseEntity<byte[]> containsImage(@ModelAttribute PDFWithPageNums request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        String pageNumber = request.getPageNumbers();

        try (PDDocument pdfDocument = pdfDocumentFactory.load(inputFile)) {
            if (PdfUtils.hasImages(pdfDocument, pageNumber)) {
                return WebResponseUtils.pdfDocToWebResponse(
                        pdfDocument, Filenames.toSimpleFileName(inputFile.getOriginalFilename()));
            }
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/filter-page-count")
    @Operation(
            summary = "Checks if a PDF is greater, less or equal to a setPageCount",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = MediaType.APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public ResponseEntity<byte[]> pageCount(@ModelAttribute PDFComparisonAndCount request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        int pageCount = request.getPageCount();
        String comparator = request.getComparator();

        boolean valid;
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            int actualPageCount = document.getNumberOfPages();
            valid = compare(actualPageCount, pageCount, comparator);
        }

        return valid
                ? WebResponseUtils.multiPartFileToWebResponse(inputFile)
                : ResponseEntity.noContent().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/filter-page-size")
    @Operation(
            summary = "Checks if a PDF is of a certain size",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = MediaType.APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public ResponseEntity<byte[]> pageSize(@ModelAttribute PageSizeRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        String standardPageSize = request.getStandardPageSize();
        String comparator = request.getComparator();

        final boolean valid;
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            PDPage firstPage = document.getPage(0);
            PDRectangle actualPageSize = firstPage.getMediaBox();

            float actualArea = actualPageSize.getWidth() * actualPageSize.getHeight();
            PDRectangle standardSize = PdfUtils.textToPageSize(standardPageSize);
            float standardArea = standardSize.getWidth() * standardSize.getHeight();

            valid = compare(actualArea, standardArea, comparator);
        }

        return valid
                ? WebResponseUtils.multiPartFileToWebResponse(inputFile)
                : ResponseEntity.noContent().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/filter-file-size")
    @Operation(
            summary = "Checks if a PDF is a set file size",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = MediaType.APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public ResponseEntity<byte[]> fileSize(@ModelAttribute FileSizeRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        long fileSize = request.getFileSize();
        String comparator = request.getComparator();

        long actualFileSize = inputFile.getSize();
        boolean valid = compare(actualFileSize, fileSize, comparator);

        return valid
                ? WebResponseUtils.multiPartFileToWebResponse(inputFile)
                : ResponseEntity.noContent().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/filter-page-rotation")
    @Operation(
            summary = "Checks if a PDF is of a certain rotation",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = MediaType.APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public ResponseEntity<byte[]> pageRotation(@ModelAttribute PageRotationRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        int rotation = request.getRotation();
        String comparator = request.getComparator();

        boolean valid;
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            PDPage firstPage = document.getPage(0);
            int actualRotation = firstPage.getRotation();
            valid = compare(actualRotation, rotation, comparator);
        }

        return valid
                ? WebResponseUtils.multiPartFileToWebResponse(inputFile)
                : ResponseEntity.noContent().build();
    }

    /**
     * Compares two values based on the provided comparator.
     *
     * @param <T> The type of the values being compared.
     * @param actual The actual value.
     * @param expected The expected value.
     * @param comparator The comparator to use (e.g., "Greater", "Less", "Equal").
     * @return True if the comparison is valid, false otherwise.
     */
    private static <T extends Comparable<T>> boolean compare(
            T actual, T expected, String comparator) {
        return switch (comparator) {
            case "Greater" -> actual.compareTo(expected) > 0;
            case "Equal" -> actual.compareTo(expected) == 0;
            case "Less" -> actual.compareTo(expected) < 0;
            default ->
                    throw ExceptionUtils.createInvalidArgumentException("comparator", comparator);
        };
    }
}
