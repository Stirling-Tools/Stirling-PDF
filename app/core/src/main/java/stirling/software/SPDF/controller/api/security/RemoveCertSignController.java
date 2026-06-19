package stirling.software.SPDF.controller.api.security;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
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
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@SecurityApi
@ApplicationScoped
@Path("/api/v1/security")
@RequiredArgsConstructor
public class RemoveCertSignController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/remove-cert-sign")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/remove-cert-sign",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Remove digital signature from PDF",
            description =
                    "This endpoint accepts a PDF file and returns the PDF file without the digital"
                            + " signature. Input:PDF, Output:PDF Type:SISO")
    public Response removeCertSignPDF(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws Exception {
        PDFFile request = new PDFFile();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);

        MultipartFile pdf = request.getFileInput();

        // Load the PDF document with proper resource management
        try (PDDocument document = pdfDocumentFactory.load(pdf)) {

            // Get the document catalog
            PDDocumentCatalog catalog = document.getDocumentCatalog();

            // Get the AcroForm
            PDAcroForm acroForm = catalog.getAcroForm();
            if (acroForm != null) {
                // Remove signature fields safely
                List<PDField> fieldsToRemove =
                        acroForm.getFields().stream()
                                .filter(field -> field instanceof PDSignatureField)
                                .toList();

                if (!fieldsToRemove.isEmpty()) {
                    acroForm.flatten(fieldsToRemove, false);
                }
            }
            // Return the modified PDF as a response
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(pdf.getOriginalFilename(), "_unsigned.pdf"),
                    tempFileManager);
        }
    }
}
