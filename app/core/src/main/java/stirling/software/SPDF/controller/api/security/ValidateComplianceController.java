package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.multipart.MultipartFile;
import org.verapdf.core.EncryptedPdfException;
import org.verapdf.core.ModelParsingException;
import org.verapdf.core.ValidationException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.WebResponseUtils;

/**
 * Pipeline-shaped sibling of /verify-pdf, whose JSON answer the policy executor reads as "no files"
 * and so empties the chain. This one hands the document back, so it composes as a pipeline step.
 *
 * <p>Deliberately has no options. Every setting a gate could offer - which standard, whether a
 * violation stops the run - is a way to turn it off silently, and a run that succeeds while
 * delivering a non-compliant document is the failure this exists to prevent.
 */
@SecurityApi
@RequiredArgsConstructor
@Slf4j
public class ValidateComplianceController {

    // veraPDF marks a document without PDF/A identification metadata with this standard id.
    private static final String NOT_PDFA_STANDARD_ID = "not-pdfa";

    private static final String DEFAULT_FILENAME = "document.pdf";
    private static final int MAX_REPORTED_FAILURES = 3;
    private static final int MAX_FAILURE_MESSAGE_LENGTH = 120;
    private static final int MAX_DETAIL_LENGTH = 460;

    private final VeraPDFService veraPDFService;

    @PostMapping(value = "/validate-compliance", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Check a PDF is PDF/A compliant",
            description =
                    "Validates the document against PDF/A and returns it unchanged when it"
                            + " conforms. A document that does not - including one that declares no"
                            + " PDF/A at all - fails the request, so this composes as the last step"
                            + " of a pipeline that must not deliver a non-compliant file.")
    public ResponseEntity<byte[]> validateCompliance(@ModelAttribute PDFFile request)
            throws IOException {

        MultipartFile file = request.getFileInput();

        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createPdfFileRequiredException();
        }

        String filename = resolveFilename(file.getOriginalFilename());

        byte[] bytes;
        List<PDFVerificationResult> results;
        try {
            // Read once: the same bytes feed validation and the pass-through response.
            bytes = file.getBytes();
            results = veraPDFService.validatePDF(new ByteArrayInputStream(bytes));
        } catch (ValidationException | ModelParsingException e) {
            // Typed, not a bare RuntimeException: an uncoded one is rendered as "an unexpected
            // error occurred", losing the sentence that says which document is unreadable.
            log.error("Could not parse '{}' for compliance validation", filename, e);
            throw ExceptionUtils.createPdfCorruptedException("during compliance validation", e);
        } catch (EncryptedPdfException e) {
            log.error("Cannot validate compliance of encrypted file: {}", filename, e);
            throw ExceptionUtils.createPdfEncryptionException(e);
        }

        List<PDFVerificationResult> checked =
                results == null
                        ? List.of()
                        : results.stream().filter(ValidateComplianceController::isPdfa).toList();

        if (!isCompliant(checked)) {
            // Typed, not a bare IOException: only an error-coded response reaches the review
            // surface as a compliance failure rather than an unrecognised one.
            throw ExceptionUtils.createComplianceNotMetException(
                    buildViolationDetail(checked) + "; the run was stopped.");
        }
        log.info("PDF/A compliance check passed for '{}'", filename);

        return WebResponseUtils.bytesToWebResponse(bytes, filename);
    }

    // The pipeline names the next step's input from this filename, and matches the next step's
    // accepted types against its extension, so it must keep a .pdf one.
    private static String resolveFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return DEFAULT_FILENAME;
        }
        String filename = originalFilename.trim();
        return filename.toLowerCase(Locale.ROOT).endsWith(".pdf") ? filename : filename + ".pdf";
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

    // Fail closed: a document that never declares PDF/A is a miss, not an absence of evidence.
    private static boolean isCompliant(List<PDFVerificationResult> checked) {
        return !checked.isEmpty() && checked.stream().allMatch(PDFVerificationResult::isCompliant);
    }

    private static String buildViolationDetail(List<PDFVerificationResult> checked) {
        if (checked.isEmpty()) {
            return "Document is not PDF/A compliant: the document does not declare PDF/A";
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
                new StringBuilder("Document is not PDF/A compliant (")
                        .append(describeProfile(failing.get(0)))
                        .append("): ")
                        .append(totalFailures)
                        .append(" rule(s) failed");
        if (!failures.isEmpty()) {
            detail.append(" - ").append(failures);
        }
        return truncate(detail.toString(), MAX_DETAIL_LENGTH);
    }

    private static List<PDFVerificationResult.ValidationIssue> failuresOf(
            PDFVerificationResult result) {
        return result.getFailures() == null ? List.of() : result.getFailures();
    }

    private static String describeProfile(PDFVerificationResult result) {
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
        return "PDF/A";
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
