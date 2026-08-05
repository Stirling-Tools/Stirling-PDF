package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.ua.AccessibilityReport;
import stirling.software.SPDF.model.api.ua.AccessibilityReportRequest;
import stirling.software.SPDF.service.ua.AccessibilityAuditService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.util.ExceptionUtils;

/** Reports how accessible a document is, without modifying it. */
@SecurityApi
@RequiredArgsConstructor
@Slf4j
public class AccessibilityReportController {

    private final AccessibilityAuditService auditService;

    @Operation(
            summary = "Report a document's accessibility standing",
            description =
                    "Validates the document against PDF/UA and reports what fails, which failures"
                            + " can be fixed automatically, and which checks still need a person."
                            + " Does not modify the file. Input:PDF Output:JSON Type:SISO")
    @AutoJobPostMapping(
            value = "/accessibility-report",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    public ResponseEntity<AccessibilityReport> report(
            @ModelAttribute AccessibilityReportRequest request) {

        MultipartFile file = request.getFileInput();
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createPdfFileRequiredException();
        }
        PdfUaProfile profile = PdfUaProfile.fromRequest(request.getProfile());
        try {
            AccessibilityReport report = auditService.audit(file.getBytes(), profile);
            log.info(
                    "Accessibility report for '{}': tagged={}, {} issue(s)",
                    file.getOriginalFilename(),
                    report.isTagged(),
                    report.getIssues().size());
            return ResponseEntity.ok(report);
        } catch (IOException e) {
            throw ExceptionUtils.createRuntimeException(
                    "error.ioException", "Could not read the PDF: {0}", e, e.getMessage());
        }
    }
}
