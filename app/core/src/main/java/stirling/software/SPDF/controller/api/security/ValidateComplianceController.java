package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.multipart.MultipartFile;
import org.verapdf.core.EncryptedPdfException;
import org.verapdf.core.ModelParsingException;
import org.verapdf.core.ValidationException;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.model.api.security.ValidateComplianceRequest;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ExceptionUtils;

/**
 * Pipeline-shaped sibling of /verify-pdf, whose JSON answer the policy executor reads as "no files"
 * and so empties the chain. Hidden from OpenAPI: an internal policy gate, not a user-facing tool.
 */
@Hidden
@SecurityApi
@RequiredArgsConstructor
@Slf4j
public class ValidateComplianceController {

    private static final String STANDARD_AUTO = "auto";
    private static final String STANDARD_PDFA = "pdfa";
    private static final String STANDARD_PDFUA = "pdfua";
    private static final String ON_VIOLATION_WARN = "warn";

    // veraPDF marks a document without PDF/A identification metadata with this standard id.
    private static final String NOT_PDFA_STANDARD_ID = "not-pdfa";

    private static final String DEFAULT_FILENAME = "document.pdf";
    private static final int MAX_REPORTED_FAILURES = 3;
    private static final int MAX_FAILURE_MESSAGE_LENGTH = 120;
    private static final int MAX_DETAIL_LENGTH = 460;

    private final VeraPDFService veraPDFService;

    @PostMapping(value = "/validate-compliance", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ToolIO(produces = ToolFormat.PDF)
    public ResponseEntity<ByteArrayResource> validateCompliance(
            @ModelAttribute ValidateComplianceRequest request) throws IOException {

        MultipartFile file = request.getFileInput();

        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createRuntimeException(
                    "error.pdfRequired", "PDF file is required", null);
        }

        String standard = resolveStandard(request.getStandard());
        String onViolation = normalise(request.getOnViolation());
        String filename = resolveFilename(file.getOriginalFilename());

        byte[] bytes;
        List<PDFVerificationResult> results;
        try {
            // Read once: the same bytes feed validation and the pass-through response.
            bytes = file.getBytes();
            results = veraPDFService.validatePDF(new ByteArrayInputStream(bytes));
        } catch (ValidationException e) {
            log.error("Validation exception for file: {}", filename, e);
            throw ExceptionUtils.createRuntimeException(
                    "error.validationFailed", "PDF validation failed: {0}", e, e.getMessage());
        } catch (ModelParsingException e) {
            log.error("Model parsing exception for file: {}", filename, e);
            throw ExceptionUtils.createRuntimeException(
                    "error.modelParsingFailed", "PDF model parsing failed: {0}", e, e.getMessage());
        } catch (EncryptedPdfException e) {
            log.error("Encrypted PDF exception for file: {}", filename, e);
            throw ExceptionUtils.createRuntimeException(
                    "error.encryptedPdf",
                    "Cannot verify encrypted PDF. Please remove password first: {0}",
                    e,
                    e.getMessage());
        } catch (IOException e) {
            log.error("IO exception for file: {}", filename, e);
            throw ExceptionUtils.createRuntimeException(
                    "error.ioException",
                    "IO error during PDF verification: {0}",
                    e,
                    e.getMessage());
        }

        List<PDFVerificationResult> checked =
                results == null
                        ? List.of()
                        : results.stream().filter(r -> matchesStandard(r, standard)).toList();

        if (!isCompliant(checked, standard)) {
            String detail = buildViolationDetail(standard, checked);
            if (!ON_VIOLATION_WARN.equals(onViolation)) {
                // Typed, not a bare IOException: only an error-coded response reaches the review
                // surface as a compliance failure rather than an unrecognised one.
                throw ExceptionUtils.createComplianceNotMetException(
                        detail + "; the run was stopped.");
            }
            log.warn("{}; continuing because onViolation=warn", detail);
        } else {
            log.info(
                    "Compliance check passed for '{}': {} standard(s) checked against '{}'",
                    filename,
                    checked.size(),
                    standard);
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(new ByteArrayResource(bytes));
    }

    private static String normalise(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String resolveStandard(String requested) {
        String standard = normalise(requested);
        if (standard.isEmpty()) {
            return STANDARD_AUTO;
        }
        if (STANDARD_AUTO.equals(standard)
                || STANDARD_PDFA.equals(standard)
                || STANDARD_PDFUA.equals(standard)) {
            return standard;
        }
        log.warn(
                "Unknown compliance standard '{}', falling back to '{}'", requested, STANDARD_AUTO);
        return STANDARD_AUTO;
    }

    // The pipeline names the next step's input from this filename, so it must keep a .pdf
    // extension.
    private static String resolveFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return DEFAULT_FILENAME;
        }
        String filename = originalFilename.trim();
        return filename.contains(".") ? filename : filename + ".pdf";
    }

    private static boolean matchesStandard(PDFVerificationResult result, String standard) {
        if (STANDARD_PDFA.equals(standard)) {
            return isPdfa(result);
        }
        if (STANDARD_PDFUA.equals(standard)) {
            return isPdfUa(result);
        }
        // auto: judge only what the document declares, so one declaring nothing passes.
        return !isUndeclared(result);
    }

    // veraPDF reports "the document declares no PDF/A" as a result of its own; under auto that is
    // not a violation, it is the absence of anything to check.
    private static boolean isUndeclared(PDFVerificationResult result) {
        return !result.isDeclaredPdfa() && NOT_PDFA_STANDARD_ID.equals(result.getStandard());
    }

    // Names carry the display form ("PDF/UA-1"), ids the veraPDF flavour ("ua1"); check both.
    private static boolean isPdfUa(PDFVerificationResult result) {
        return contains(result.getStandardName(), "pdf/ua")
                || contains(result.getValidationProfileName(), "pdf/ua")
                || contains(result.getStandard(), "ua")
                || contains(result.getValidationProfile(), "ua");
    }

    private static boolean isPdfa(PDFVerificationResult result) {
        if (isPdfUa(result)) {
            return false;
        }
        // The "not-pdfa" placeholder is a PDF/A verdict too: the document declares no PDF/A.
        return result.isDeclaredPdfa()
                || NOT_PDFA_STANDARD_ID.equals(result.getStandard())
                || contains(result.getStandardName(), "pdf/a")
                || contains(result.getValidationProfileName(), "pdf/a");
    }

    private static boolean contains(String value, String needle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(needle);
    }

    private static boolean isCompliant(List<PDFVerificationResult> checked, String standard) {
        // Fail closed: a standard the caller asked for but the document never declares is a miss.
        if (checked.isEmpty()) {
            return STANDARD_AUTO.equals(standard);
        }
        return checked.stream().allMatch(PDFVerificationResult::isCompliant);
    }

    private static String buildViolationDetail(
            String standard, List<PDFVerificationResult> checked) {

        String label = standardLabel(standard);
        if (checked.isEmpty()) {
            return "Document is not "
                    + label
                    + " compliant: the document does not declare "
                    + label;
        }

        List<PDFVerificationResult> failing =
                checked.stream().filter(r -> !r.isCompliant()).toList();
        int totalFailures =
                failing.stream().mapToInt(PDFVerificationResult::getTotalFailures).sum();
        String failures =
                failing.stream()
                        .flatMap(r -> failuresOf(r).stream())
                        .limit(MAX_REPORTED_FAILURES)
                        .map(ValidateComplianceController::describeFailure)
                        .filter(f -> !f.isEmpty())
                        .collect(Collectors.joining(", "));

        StringBuilder detail =
                new StringBuilder("Document is not ")
                        .append(label)
                        .append(" compliant (")
                        .append(describeProfile(failing.get(0), label))
                        .append("): ")
                        .append(totalFailures)
                        .append(" rule(s) failed");
        if (!failures.isEmpty()) {
            detail.append(" - ").append(failures);
        }
        return truncate(detail.toString(), MAX_DETAIL_LENGTH);
    }

    private static String standardLabel(String standard) {
        if (STANDARD_PDFA.equals(standard)) {
            return "PDF/A";
        }
        if (STANDARD_PDFUA.equals(standard)) {
            return "PDF/UA";
        }
        return "PDF standards";
    }

    private static List<PDFVerificationResult.ValidationIssue> failuresOf(
            PDFVerificationResult result) {
        return result.getFailures() == null ? List.of() : result.getFailures();
    }

    private static String describeProfile(PDFVerificationResult result, String fallback) {
        if (result.getStandardName() != null && !result.getStandardName().isBlank()) {
            return result.getStandardName();
        }
        if (result.getValidationProfileName() != null
                && !result.getValidationProfileName().isBlank()) {
            return result.getValidationProfileName();
        }
        if (result.getStandard() != null && !result.getStandard().isBlank()) {
            return result.getStandard();
        }
        return fallback;
    }

    private static String describeFailure(PDFVerificationResult.ValidationIssue issue) {
        String ruleId = issue.getRuleId();
        if (ruleId == null || ruleId.isBlank()) {
            ruleId = issue.getClause();
        }
        String message =
                issue.getMessage() == null
                        ? ""
                        : truncate(issue.getMessage().trim(), MAX_FAILURE_MESSAGE_LENGTH);
        if (ruleId == null || ruleId.isBlank()) {
            return message;
        }
        return message.isEmpty() ? ruleId : ruleId + ": " + message;
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max - 3) + "...";
    }
}
