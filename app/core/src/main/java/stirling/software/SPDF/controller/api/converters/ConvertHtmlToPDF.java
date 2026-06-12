package stirling.software.SPDF.controller.api.converters;

import java.nio.file.Files;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.*;

@ConvertApi
@Path("/api/v1/convert")
@ApplicationScoped
@RequiredArgsConstructor
public class ConvertHtmlToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final RuntimePathConfig runtimePathConfig;

    private final TempFileManager tempFileManager;

    private final CustomHtmlSanitizer customHtmlSanitizer;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/html/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @POST
    @Path("/html/pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @StandardPdfResponse
    @Operation(
            summary = "Convert an HTML or ZIP (containing HTML and CSS) to PDF",
            description =
                    "This endpoint takes an HTML or ZIP file input and converts it to a PDF format."
                            + " Input:HTML Output:PDF Type:SISO")
    public Response HtmlToPdf(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("zoom") float zoom)
            throws Exception {
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);
        request.setZoom(zoom);

        MultipartFile fileInput = request.getFileInput();

        if (fileInput == null) {
            throw ExceptionUtils.createHtmlFileRequiredException();
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null
                || (!originalFilename.endsWith(".html") && !originalFilename.endsWith(".zip"))) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", ".html or .zip");
        }

        byte[] pdfBytes =
                FileToPdf.convertHtmlToPdf(
                        runtimePathConfig.getWeasyPrintPath(),
                        request,
                        fileInput.getBytes(),
                        originalFilename,
                        tempFileManager,
                        customHtmlSanitizer);

        pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

        String outputFilename = GeneralUtils.generateFilename(originalFilename, ".pdf");

        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try {
            Files.write(tempOut.getPath(), pdfBytes);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        return WebResponseUtils.pdfFileToWebResponse(tempOut, outputFilename);
    }
}
