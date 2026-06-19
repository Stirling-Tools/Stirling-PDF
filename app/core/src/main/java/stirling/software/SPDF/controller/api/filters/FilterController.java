package stirling.software.SPDF.controller.api.filters;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.PDFComparisonAndCount;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.filter.ContainsTextRequest;
import stirling.software.SPDF.model.api.filter.FileSizeRequest;
import stirling.software.SPDF.model.api.filter.PageRotationRequest;
import stirling.software.SPDF.model.api.filter.PageSizeRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.FilterApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@FilterApi
@Path("/api/v1/filter")
@ApplicationScoped
@RequiredArgsConstructor
public class FilterController {

    private static final String APPLICATION_PDF_VALUE = "application/pdf";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/filter-contains-text")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/filter-contains-text",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Checks if a PDF contains set text, returns true if does",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public Response containsText(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("pageNumbers") String pageNumbers,
            @RestForm("text") String text)
            throws IOException, InterruptedException {
        ContainsTextRequest request = new ContainsTextRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setPageNumbers(pageNumbers);
        request.setText(text);

        MultipartFile inputFile = request.getFileInput();
        String requestedText = request.getText();
        String pageNumber = request.getPageNumbers();

        try (PDDocument pdfDocument = pdfDocumentFactory.load(inputFile)) {
            if (PdfUtils.hasText(pdfDocument, pageNumber, requestedText)) {
                return WebResponseUtils.pdfDocToWebResponse(
                        pdfDocument,
                        Filenames.toSimpleFileName(inputFile.getOriginalFilename()),
                        tempFileManager);
            }
        }
        return Response.noContent().build();
    }

    @POST
    @Path("/filter-contains-image")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/filter-contains-image",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Checks if a PDF contains an image",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public Response containsImage(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("pageNumbers") String pageNumbers)
            throws IOException, InterruptedException {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setPageNumbers(pageNumbers);

        MultipartFile inputFile = request.getFileInput();
        String pageNumber = request.getPageNumbers();

        try (PDDocument pdfDocument = pdfDocumentFactory.load(inputFile)) {
            if (PdfUtils.hasImages(pdfDocument, pageNumber)) {
                return WebResponseUtils.pdfDocToWebResponse(
                        pdfDocument,
                        Filenames.toSimpleFileName(inputFile.getOriginalFilename()),
                        tempFileManager);
            }
        }
        return Response.noContent().build();
    }

    @POST
    @Path("/filter-page-count")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/filter-page-count",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Checks if a PDF is greater, less or equal to a setPageCount",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public Response pageCount(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("comparator") String comparatorParam,
            @RestForm("pageCount") int pageCountParam)
            throws IOException, InterruptedException {
        PDFComparisonAndCount request = new PDFComparisonAndCount();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setComparator(comparatorParam);
        request.setPageCount(pageCountParam);

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
                : Response.noContent().build();
    }

    @POST
    @Path("/filter-page-size")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/filter-page-size",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Checks if a PDF is of a certain size",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public Response pageSize(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("comparator") String comparatorParam,
            @RestForm("standardPageSize") String standardPageSizeParam)
            throws IOException, InterruptedException {
        PageSizeRequest request = new PageSizeRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setComparator(comparatorParam);
        request.setStandardPageSize(standardPageSizeParam);

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
                : Response.noContent().build();
    }

    @POST
    @Path("/filter-file-size")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/filter-file-size",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Checks if a PDF is a set file size",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public Response fileSize(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("comparator") String comparatorParam,
            @RestForm("fileSize") long fileSizeParam)
            throws IOException, InterruptedException {
        FileSizeRequest request = new FileSizeRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setComparator(comparatorParam);
        request.setFileSize(fileSizeParam);

        MultipartFile inputFile = request.getFileInput();
        long fileSize = request.getFileSize();
        String comparator = request.getComparator();

        long actualFileSize = inputFile.getSize();
        boolean valid = compare(actualFileSize, fileSize, comparator);

        return valid
                ? WebResponseUtils.multiPartFileToWebResponse(inputFile)
                : Response.noContent().build();
    }

    @POST
    @Path("/filter-page-rotation")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/filter-page-rotation",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Checks if a PDF is of a certain rotation",
            description = "Input:PDF Output:Boolean Type:SISO")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "PDF passed filter",
                content = @Content(mediaType = APPLICATION_PDF_VALUE)),
        @ApiResponse(
                responseCode = "204",
                description = "PDF did not pass filter",
                content = @Content())
    })
    public Response pageRotation(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("comparator") String comparatorParam,
            @RestForm("rotation") int rotationParam)
            throws IOException, InterruptedException {
        PageRotationRequest request = new PageRotationRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setComparator(comparatorParam);
        request.setRotation(rotationParam);

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
                : Response.noContent().build();
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
