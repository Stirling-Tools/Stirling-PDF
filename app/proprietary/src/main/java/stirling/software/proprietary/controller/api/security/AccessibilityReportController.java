package stirling.software.proprietary.controller.api.security;

import java.io.IOException;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.api.ua.AccessibilityReport;
import stirling.software.proprietary.model.api.ua.AccessibilityReportRequest;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.service.ua.AccessibilityAuditService;

/** Reports how accessible a document is, without modifying it. */
@SecurityApi
@Path("/api/v1/security")
@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class AccessibilityReportController {

    private final AccessibilityAuditService auditService;

    @POST
    @Path("/accessibility-report")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @ToolIO(produces = ToolFormat.JSON)
    @Operation(
            summary = "Report a document's accessibility standing",
            description =
                    "Validates the document against PDF/UA and reports what fails, which failures"
                            + " can be fixed automatically, and which checks still need a person."
                            + " Does not modify the file.")
    // Costs a full veraPDF pass plus the converter's own layout analysis over every page.
    @AutoJobPostMapping(
            value = "/accessibility-report",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    public Response report(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("profile") String profile) {

        AccessibilityReportRequest request = new AccessibilityReportRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setProfile(profile);

        MultipartFile file = request.getFileInput();
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createPdfFileRequiredException();
        }
        PdfUaProfile uaProfile = PdfUaProfile.fromRequest(request.getProfile());
        try {
            AccessibilityReport report = auditService.audit(file.getBytes(), uaProfile);
            log.info(
                    "Accessibility report for '{}': tagged={}, {} issue(s)",
                    file.getOriginalFilename(),
                    report.isTagged(),
                    report.getIssues().size());
            return Response.ok(report).build();
        } catch (IOException e) {
            throw ExceptionUtils.createRuntimeException(
                    "error.ioException", "Could not read the PDF: {0}", e, e.getMessage());
        }
    }
}
