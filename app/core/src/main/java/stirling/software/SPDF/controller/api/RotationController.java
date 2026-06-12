package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Path("/api/v1/general")
@ApplicationScoped
@RequiredArgsConstructor
public class RotationController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/rotate-pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/rotate-pdf",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Rotate a PDF file",
            description =
                    "This endpoint rotates a given PDF file by a specified angle. The angle must be"
                            + " a multiple of 90. Input:PDF Output:PDF Type:SISO")
    public Response rotatePDF(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("angle") Integer angle)
            throws IOException {
        // Rebuild the request model from multipart form fields. PDFFile/RotatePDFRequest are
        // not annotated for JAX-RS multipart @BeanParam binding, so we populate them explicitly.
        RotatePDFRequest request = new RotatePDFRequest();
        MultipartFile pdfFile = FileUploadMultipartFile.of(fileUpload);
        request.setFileInput(pdfFile);
        request.setFileId(fileId);
        request.setAngle(angle);

        // Validate the angle is a multiple of 90
        if (angle % 90 != 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.angleNotMultipleOf90", "Angle must be a multiple of 90");
        }

        // Load the PDF document with proper resource management
        try (PDDocument document = pdfDocumentFactory.load(request)) {

            // Get the list of pages in the document
            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {
                page.setRotation(page.getRotation() + angle);
            }

            // Return the rotated PDF as a response
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_rotated.pdf"),
                    tempFileManager);
        }
    }
}
