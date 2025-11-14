package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.PDFAIdentificationSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpParsingException;
import org.springframework.stereotype.Service;
import org.verapdf.core.EncryptedPdfException;
import org.verapdf.core.ModelParsingException;
import org.verapdf.core.ValidationException;
import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.PDFAValidator;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.flavours.PDFFlavours;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;

@Service
@Slf4j
public class VeraPDFService {

    private static final Set<String> WARNING_RULES =
            Set.of(
                    "6.1.13-1", // Recommended metadata properties
                    "6.7.3-1", // Optional XMP metadata
                    "6.2.2-2" // Non-critical font issues
                    );

    private static final Set<String> CRITICAL_CLAUSE_PREFIXES = Set.of("6.1", "6.2", "6.3", "6.4");
    private static final String NOT_PDFA_STANDARD_ID = "not-pdfa";
    private static final String NOT_PDFA_STANDARD_NAME =
            "Not PDF/A (no PDF/A identification metadata)";

    @PostConstruct
    public void initialize() {
        try {
            VeraGreenfieldFoundryProvider.initialise();
            log.info("veraPDF Greenfield initialized successfully");
        } catch (Exception e) {
            log.error("Failed to initialize veraPDF", e);
        }
    }

    public static PDFVerificationResult validatePDF(InputStream pdfStream, String standardString)
            throws IOException, ValidationException, ModelParsingException, EncryptedPdfException {

        byte[] pdfBytes = pdfStream.readAllBytes();
        PDFAFlavour validationFlavour = PDFAFlavour.fromString(standardString);
        Optional<PDFAFlavour> declaredPdfaFlavour = extractDeclaredPdfaFlavour(pdfBytes);

        try (PDFAParser parser =
                Foundries.defaultInstance()
                        .createParser(new ByteArrayInputStream(pdfBytes), validationFlavour)) {
            PDFAValidator validator =
                    Foundries.defaultInstance().createValidator(validationFlavour, false);
            ValidationResult result = validator.validate(parser);

            return convertToVerificationResult(
                    result, declaredPdfaFlavour.orElse(null), validationFlavour);
        }
    }

    public static List<PDFVerificationResult> validateAllDeclaredStandards(InputStream pdfStream)
            throws IOException, ValidationException, ModelParsingException, EncryptedPdfException {

        byte[] pdfBytes = pdfStream.readAllBytes();
        Optional<PDFAFlavour> declaredPdfaFlavour = extractDeclaredPdfaFlavour(pdfBytes);
        List<PDFVerificationResult> results = new ArrayList<>();

        List<PDFAFlavour> detectedFlavours;
        try (PDFAParser detectionParser =
                Foundries.defaultInstance().createParser(new ByteArrayInputStream(pdfBytes))) {
            detectedFlavours = detectionParser.getFlavours();
        }

        List<PDFAFlavour> flavoursToValidate = new ArrayList<>();

        declaredPdfaFlavour.ifPresent(flavoursToValidate::add);

        for (PDFAFlavour flavour : detectedFlavours) {
            if (PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A)) {
                if (declaredPdfaFlavour.isPresent() && !declaredPdfaFlavour.get().equals(flavour)) {
                    flavoursToValidate.add(flavour);
                } else if (declaredPdfaFlavour.isEmpty()) {
                    log.debug(
                            "Ignoring detected PDF/A flavour {} because no PDF/A declaration exists in XMP",
                            flavour.getId());
                }
            } else if (PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_UA)
                    || PDFFlavours.isFlavourFamily(
                            flavour, PDFAFlavour.SpecificationFamily.WTPDF)) {
                flavoursToValidate.add(flavour);
            }
        }

        if (declaredPdfaFlavour.isEmpty()) {
            results.add(createNoPdfaDeclarationResult());
        }

        if (flavoursToValidate.isEmpty()) {
            log.info("No verifiable PDF/A, PDF/UA, or WTPDF standards declared via XMP metadata");
            return results;
        }

        for (PDFAFlavour flavour : flavoursToValidate) {
            try (PDFAParser parser =
                    Foundries.defaultInstance()
                            .createParser(new ByteArrayInputStream(pdfBytes), flavour)) {
                PDFAValidator validator =
                        Foundries.defaultInstance().createValidator(flavour, false);
                ValidationResult result = validator.validate(parser);
                PDFAFlavour declaredForResult =
                        PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A)
                                ? declaredPdfaFlavour.orElse(null)
                                : flavour;
                results.add(convertToVerificationResult(result, declaredForResult, flavour));
            } catch (Exception e) {
                log.error("Error validating standard {}: {}", flavour.getId(), e.getMessage());
                results.add(
                        buildErrorResult(
                                declaredPdfaFlavour,
                                flavour,
                                "Validation error: " + e.getMessage()));
            }
        }

        return results;
    }

    private static PDFVerificationResult convertToVerificationResult(
            ValidationResult result, PDFAFlavour declaredFlavour, PDFAFlavour validationFlavour) {
        PDFVerificationResult verificationResult = new PDFVerificationResult();

        PDFAFlavour validationProfile =
                validationFlavour != null ? validationFlavour : result.getPDFAFlavour();
        boolean validationIsPdfa = isPdfaFlavour(validationProfile);

        if (validationProfile != null) {
            verificationResult.setValidationProfile(validationProfile.getId());
            verificationResult.setValidationProfileName(getStandardName(validationProfile));
        }

        if (declaredFlavour != null) {
            verificationResult.setStandard(declaredFlavour.getId());
            verificationResult.setDeclaredPdfa(isPdfaFlavour(declaredFlavour));
        } else if (validationIsPdfa) {
            verificationResult.setStandard(NOT_PDFA_STANDARD_ID);
            verificationResult.setDeclaredPdfa(false);
        } else if (validationProfile != null) {
            verificationResult.setStandard(validationProfile.getId());
            verificationResult.setDeclaredPdfa(false);
        } else {
            verificationResult.setStandard(NOT_PDFA_STANDARD_ID);
            verificationResult.setDeclaredPdfa(false);
        }

        List<TestAssertion> assertions = result.getTestAssertions();

        for (TestAssertion assertion : assertions) {
            TestAssertion.Status status = assertion.getStatus();

            if (status == TestAssertion.Status.FAILED) {
                classifyAssertion(assertion, verificationResult);
            }
        }

        verificationResult.setCompliant(verificationResult.getTotalFailures() == 0);

        String baseName;
        if (declaredFlavour != null) {
            baseName = getStandardName(declaredFlavour);
        } else if (validationIsPdfa) {
            baseName = NOT_PDFA_STANDARD_NAME;
        } else if (validationProfile != null) {
            baseName = getStandardName(validationProfile);
        } else {
            baseName = "Unknown standard";
        }

        String standardDisplay =
                formatStandardDisplay(
                        baseName,
                        verificationResult.getTotalFailures(),
                        verificationResult.getTotalWarnings(),
                        isPdfaFlavour(declaredFlavour),
                        validationIsPdfa && declaredFlavour == null);
        verificationResult.setStandardName(standardDisplay);
        verificationResult.setComplianceSummary(standardDisplay);

        log.debug(
                "Validation complete for profile {} (declared: {}): {} errors, {} warnings",
                validationProfile != null ? validationProfile.getId() : "unknown",
                declaredFlavour != null ? declaredFlavour.getId() : NOT_PDFA_STANDARD_ID,
                verificationResult.getTotalFailures(),
                verificationResult.getTotalWarnings());

        return verificationResult;
    }

    private static void classifyAssertion(
            TestAssertion assertion, PDFVerificationResult verificationResult) {

        PDFVerificationResult.ValidationIssue issue = createValidationIssue(assertion);
        String ruleId = assertion.getRuleId() != null ? assertion.getRuleId().toString() : "";
        String message = assertion.getMessage() != null ? assertion.getMessage() : "";
        String clause = assertion.getRuleId() != null ? assertion.getRuleId().getClause() : "";

        if (isWarningRule(ruleId)) {
            verificationResult.addWarning(issue);
            return;
        }

        if (isWarningByMessage(message)) {
            verificationResult.addWarning(issue);
            return;
        }

        if (isWarningByClause(clause)) {
            verificationResult.addWarning(issue);
            return;
        }

        verificationResult.addFailure(issue);
    }

    private static PDFVerificationResult.ValidationIssue createValidationIssue(
            TestAssertion assertion) {
        PDFVerificationResult.ValidationIssue issue = new PDFVerificationResult.ValidationIssue();
        issue.setRuleId(assertion.getRuleId() != null ? assertion.getRuleId().toString() : "");
        issue.setMessage(assertion.getMessage());
        issue.setLocation(
                assertion.getLocation() != null ? assertion.getLocation().toString() : "Unknown");
        issue.setSpecification(
                assertion.getRuleId() != null && assertion.getRuleId().getSpecification() != null
                        ? assertion.getRuleId().getSpecification().toString()
                        : "");
        issue.setClause(assertion.getRuleId() != null ? assertion.getRuleId().getClause() : "");
        int testNumber = assertion.getRuleId() != null ? assertion.getRuleId().getTestNumber() : 0;
        issue.setTestNumber(testNumber > 0 ? String.valueOf(testNumber) : "");
        return issue;
    }

    private static boolean isWarningRule(String ruleId) {
        return ruleId != null && WARNING_RULES.contains(ruleId);
    }

    private static boolean isWarningByMessage(String message) {
        // isBlank() already handles null and empty strings
        if (message == null || message.isBlank()) {
            return false;
        }

        String normalized = message.toLowerCase(Locale.ROOT);

        return normalized.contains("recommended")
                || normalized.contains("should")
                || normalized.contains("optional")
                || normalized.contains("missing recommended");
    }

    private static boolean isWarningByClause(String clause) {
        // isBlank() already handles null and empty strings
        if (clause == null || clause.isBlank()) {
            return false;
        }

        if (clause.startsWith("6.7")) {
            return true;
        }

        for (String criticalPrefix : CRITICAL_CLAUSE_PREFIXES) {
            if (clause.startsWith(criticalPrefix)) {
                return false;
            }
        }

        return true;
    }

    private static PDFVerificationResult createNoPdfaDeclarationResult() {
        PDFVerificationResult result = new PDFVerificationResult();
        result.setStandard(NOT_PDFA_STANDARD_ID);
        result.setStandardName(NOT_PDFA_STANDARD_NAME);
        result.setComplianceSummary(NOT_PDFA_STANDARD_NAME);
        result.setCompliant(false);
        result.setDeclaredPdfa(false);
        PDFVerificationResult.ValidationIssue issue = new PDFVerificationResult.ValidationIssue();
        issue.setMessage("Document does not declare PDF/A compliance in its XMP metadata.");
        issue.setSpecification("XMP pdfaid");
        result.addFailure(issue);
        return result;
    }

    private static Optional<PDFAFlavour> extractDeclaredPdfaFlavour(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            if (metadata == null) {
                return Optional.empty();
            }

            try (InputStream xmpStream = metadata.createInputStream()) {
                if (xmpStream == null) {
                    return Optional.empty();
                }
                DomXmpParser parser = new DomXmpParser();
                XMPMetadata xmpMetadata = parser.parse(xmpStream);
                PDFAIdentificationSchema pdfaid = xmpMetadata.getPDFAIdentificationSchema();
                if (pdfaid == null) {
                    return Optional.empty();
                }

                Integer part = pdfaid.getPart();
                String conformance = pdfaid.getConformance();

                if (part == null || conformance == null || conformance.isBlank()) {
                    return Optional.empty();
                }

                String flavourId = part + conformance.trim().toLowerCase(Locale.ROOT);
                return Optional.ofNullable(PDFAFlavour.fromString(flavourId));
            }
        } catch (XmpParsingException e) {
            log.warn(
                    "Invalid XMP metadata encountered while checking PDF/A declaration: {}",
                    e.getMessage());
            log.debug("XMP parsing error", e);
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Unable to extract PDF/A declaration from XMP: {}", e.getMessage());
            log.debug("XMP extraction error", e);
            return Optional.empty();
        }
    }

    private static PDFVerificationResult buildErrorResult(
            Optional<PDFAFlavour> declaredPdfaFlavour,
            PDFAFlavour validationFlavour,
            String errorMessage) {

        PDFVerificationResult errorResult = new PDFVerificationResult();
        PDFAFlavour declaredForResult =
                validationFlavour != null && isPdfaFlavour(validationFlavour)
                        ? declaredPdfaFlavour.orElse(null)
                        : validationFlavour;

        if (declaredForResult != null) {
            errorResult.setStandard(declaredForResult.getId());
            errorResult.setStandardName(getStandardName(declaredForResult) + " with errors");
            errorResult.setDeclaredPdfa(isPdfaFlavour(declaredForResult));
        } else if (validationFlavour != null && isPdfaFlavour(validationFlavour)) {
            errorResult.setStandard(NOT_PDFA_STANDARD_ID);
            errorResult.setStandardName(NOT_PDFA_STANDARD_NAME);
            errorResult.setDeclaredPdfa(false);
        } else {
            errorResult.setStandard(
                    validationFlavour != null ? validationFlavour.getId() : NOT_PDFA_STANDARD_ID);
            errorResult.setStandardName(
                    (validationFlavour != null
                                    ? getStandardName(validationFlavour)
                                    : "Unknown standard")
                            + " with errors");
            errorResult.setDeclaredPdfa(false);
        }

        errorResult.setValidationProfile(
                validationFlavour != null ? validationFlavour.getId() : NOT_PDFA_STANDARD_ID);
        errorResult.setValidationProfileName(
                validationFlavour != null
                        ? getStandardName(validationFlavour)
                        : "Unknown standard");
        errorResult.setComplianceSummary(errorResult.getStandardName());
        errorResult.setCompliant(false);

        PDFVerificationResult.ValidationIssue failure = new PDFVerificationResult.ValidationIssue();
        failure.setMessage(errorMessage);
        errorResult.addFailure(failure);

        return errorResult;
    }

    private static boolean isPdfaFlavour(PDFAFlavour flavour) {
        return PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A);
    }

    private static String formatStandardDisplay(
            String baseName,
            int errorCount,
            int warningCount,
            boolean declaredPdfa,
            boolean inferredPdfaWithoutDeclaration) {

        if (inferredPdfaWithoutDeclaration) {
            return NOT_PDFA_STANDARD_NAME;
        }

        if (!declaredPdfa && NOT_PDFA_STANDARD_NAME.equals(baseName)) {
            return NOT_PDFA_STANDARD_NAME;
        }

        if (errorCount > 0) {
            return baseName + " with errors";
        }

        if (warningCount > 0) {
            return baseName + " with warnings";
        }

        return baseName + " compliant";
    }

    private static String getStandardName(PDFAFlavour flavour) {
        String id = flavour.getId();
        String part = flavour.getPart().toString();
        String level = flavour.getLevel().toString();

        // PDF/A standards - Fixed: proper length check and parentheses
        if (!id.isEmpty()
                && (id.charAt(0) == '1'
                        || id.charAt(0) == '2'
                        || id.charAt(0) == '3'
                        || id.charAt(0) == '4')) {
            return "PDF/A-" + part + (level.isEmpty() ? "" : level);
        }
        // PDF/UA standards
        else if (id.contains("ua")) {
            return "PDF/UA-" + part;
        }
        // WTPDF standards
        else if (id.contains("wtpdf")) {
            return "WTPDF " + part;
        }

        return flavour.toString();
    }
}
