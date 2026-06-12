package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.List;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.verapdf.core.EncryptedPdfException;
import org.verapdf.core.ModelParsingException;
import org.verapdf.core.ValidationException;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.PDFVerificationRequest;
import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.util.ExceptionUtils;

@SecurityApi
@Path("/api/v1/security")
@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class VerifyPDFController {

    private final VeraPDFService veraPDFService;

    @Operation(
            summary = "Verify PDF Standards Compliance",
            description =
                    "Validates PDF files against the standards declared in their metadata. "
                            + "Automatically detects PDF/A, PDF/UA-1, PDF/UA-2, and WTPDF standards "
                            + "from the document's XMP metadata and validates compliance. "
                            + "Input:PDF Output:JSON Type:SISO")
    @POST
    @Path("/verify-pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/verify-pdf",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    public Response verifyPDF(@RestForm("fileInput") FileUpload fileUpload) {

        PDFVerificationRequest request = new PDFVerificationRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));

        MultipartFile file = request.getFileInput();

        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createRuntimeException(
                    "error.pdfRequired", "PDF file is required", null);
        }

        try {
            log.info("Detecting and verifying standards in PDF '{}'", file.getOriginalFilename());

            List<PDFVerificationResult> results = veraPDFService.validatePDF(file.getInputStream());

            log.info(
                    "Verification complete for '{}': {} standard(s) checked",
                    file.getOriginalFilename(),
                    results.size());

            return Response.ok(results).build();

        } catch (ValidationException e) {
            log.error("Validation exception for file: {}", file.getOriginalFilename(), e);
            throw ExceptionUtils.createRuntimeException(
                    "error.validationFailed", "PDF validation failed: {0}", e, e.getMessage());
        } catch (ModelParsingException e) {
            log.error("Model parsing exception for file: {}", file.getOriginalFilename(), e);
            throw ExceptionUtils.createRuntimeException(
                    "error.modelParsingFailed", "PDF model parsing failed: {0}", e, e.getMessage());
        } catch (EncryptedPdfException e) {
            log.error("Encrypted PDF exception for file: {}", file.getOriginalFilename(), e);
            throw ExceptionUtils.createRuntimeException(
                    "error.encryptedPdf",
                    "Cannot verify encrypted PDF. Please remove password first: {0}",
                    e,
                    e.getMessage());
        } catch (IOException e) {
            log.error("IO exception for file: {}", file.getOriginalFilename(), e);
            throw ExceptionUtils.createRuntimeException(
                    "error.ioException",
                    "IO error during PDF verification: {0}",
                    e,
                    e.getMessage());
        }
    }
}
