package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

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

    private static final String NOT_PDFA_STANDARD_ID = "not-pdfa";
    private static final String NOT_PDFA_STANDARD_NAME =
            "Not PDF/A (no PDF/A identification metadata)";

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
        } else if (validationProfile != null && !validationIsPdfa) {
            verificationResult.setStandard(validationProfile.getId());
            verificationResult.setDeclaredPdfa(false);
        } else {
            verificationResult.setStandard(NOT_PDFA_STANDARD_ID);
            verificationResult.setDeclaredPdfa(false);
        }

        for (TestAssertion assertion : result.getTestAssertions()) {
            if (assertion.getStatus() == TestAssertion.Status.FAILED) {
                PDFVerificationResult.ValidationIssue issue = createValidationIssue(assertion);
                verificationResult.addFailure(issue);
            }
        }

        verificationResult.setCompliant(result.isCompliant());

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
                        isPdfaFlavour(declaredFlavour),
                        validationIsPdfa && declaredFlavour == null);
        verificationResult.setStandardName(standardDisplay);
        verificationResult.setComplianceSummary(standardDisplay);

        log.debug(
                "Validation complete for profile {} (declared: {}): {} failures",
                validationProfile != null ? validationProfile.getId() : "unknown",
                declaredFlavour != null ? declaredFlavour.getId() : NOT_PDFA_STANDARD_ID,
                verificationResult.getTotalFailures());

        return verificationResult;
    }

    private static PDFVerificationResult.ValidationIssue createValidationIssue(
            TestAssertion assertion) {
        PDFVerificationResult.ValidationIssue issue = new PDFVerificationResult.ValidationIssue();

        if (assertion.getRuleId() != null) {
            issue.setRuleId(assertion.getRuleId().toString());
            issue.setClause(assertion.getRuleId().getClause());

            if (assertion.getRuleId().getSpecification() != null) {
                issue.setSpecification(assertion.getRuleId().getSpecification().toString());
            }

            int testNumber = assertion.getRuleId().getTestNumber();
            if (testNumber > 0) {
                issue.setTestNumber(String.valueOf(testNumber));
            }
        }

        issue.setMessage(assertion.getMessage());
        issue.setLocation(
                assertion.getLocation() != null ? assertion.getLocation().toString() : "Unknown");

        return issue;
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

    private static PDFVerificationResult buildErrorResult(
            PDFAFlavour declaredFlavour, PDFAFlavour validationFlavour, String errorMessage) {

        PDFVerificationResult errorResult = new PDFVerificationResult();

        PDFAFlavour declaredForResult =
                isPdfaFlavour(validationFlavour) ? declaredFlavour : validationFlavour;

        if (declaredForResult != null) {
            errorResult.setStandard(declaredForResult.getId());
            errorResult.setStandardName(getStandardName(declaredForResult) + " with errors");
            errorResult.setDeclaredPdfa(isPdfaFlavour(declaredForResult));
        } else if (isPdfaFlavour(validationFlavour)) {
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

    @PostConstruct
    public void initialize() {
        try {
            VeraGreenfieldFoundryProvider.initialise();
            log.info("VeraPDF Greenfield initialized successfully");
        } catch (Exception e) {
            log.error("Failed to initialize VeraPDF", e);
        }
    }

    public List<PDFVerificationResult> validatePDF(InputStream pdfStream)
            throws IOException, ValidationException, ModelParsingException, EncryptedPdfException {

        byte[] pdfBytes = pdfStream.readAllBytes();
        List<PDFVerificationResult> results = new ArrayList<>();

        PDFAFlavour declaredFlavour;
        List<PDFAFlavour> detectedFlavours;

        try (PDFAParser detectionParser =
                Foundries.defaultInstance().createParser(new ByteArrayInputStream(pdfBytes))) {
            declaredFlavour = detectionParser.getFlavour();
            detectedFlavours = detectionParser.getFlavours();
        }

        // For PDF/A flavours, we need to validate first to check if PDF/A identification exists in
        // XMP
        // If declaredFlavour is PDF/A, do a quick validation to check for PDF/A identification
        // schema
        boolean hasValidPdfaMetadata = false;
        if (isPdfaFlavour(declaredFlavour)) {
            try (PDFAParser quickParser =
                    Foundries.defaultInstance()
                            .createParser(new ByteArrayInputStream(pdfBytes), declaredFlavour)) {
                PDFAValidator quickValidator =
                        Foundries.defaultInstance().createValidator(declaredFlavour, false);
                ValidationResult quickResult = quickValidator.validate(quickParser);

                // Check if the document has the PDF/A Identification extension schema (clause
                // 6.7.11, test 1)
                // OR if it lacks XMP metadata entirely (clause 6.7.2, test 1)
                // If either of these errors is present, the document is NOT a declared PDF/A
                hasValidPdfaMetadata = true;
                for (TestAssertion assertion : quickResult.getTestAssertions()) {
                    if (assertion.getStatus() == TestAssertion.Status.FAILED
                            && assertion.getRuleId() != null) {
                        String clause = assertion.getRuleId().getClause();
                        int testNumber = assertion.getRuleId().getTestNumber();

                        // Missing XMP metadata entirely (clause 6.7.2, test 1)
                        if ("6.7.2".equals(clause) && testNumber == 1) {
                            hasValidPdfaMetadata = false;
                            log.debug(
                                    "Document lacks XMP metadata (6.7.2): {}",
                                    assertion.getMessage());
                            break;
                        }

                        // Missing PDF/A identification schema in XMP (clause 6.7.11, test 1)
                        if ("6.7.11".equals(clause) && testNumber == 1) {
                            hasValidPdfaMetadata = false;
                            log.debug(
                                    "Document lacks PDF/A identification in XMP (6.7.11): {}",
                                    assertion.getMessage());
                            break;
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("Error checking for PDF/A identification: {}", e.getMessage());
                hasValidPdfaMetadata = false;
            }
        }

        List<PDFAFlavour> flavoursToValidate = new ArrayList<>();
        boolean hasPdfaDeclaration = isPdfaFlavour(declaredFlavour) && hasValidPdfaMetadata;

        if (declaredFlavour != null) {
            boolean isDeclaredPdfa = isPdfaFlavour(declaredFlavour);
            if (isDeclaredPdfa && hasPdfaDeclaration) {
                flavoursToValidate.add(declaredFlavour);
            } else if (!isDeclaredPdfa) {
                flavoursToValidate.add(declaredFlavour);
            }
        }

        for (PDFAFlavour flavour : detectedFlavours) {
            if (flavour.equals(declaredFlavour)) {
                continue;
            }

            if (PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A)) {
                if (hasPdfaDeclaration) {
                    flavoursToValidate.add(flavour);
                } else {
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

        if (!hasPdfaDeclaration) {
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

                PDFAFlavour parserDeclared = parser.getFlavour();
                PDFAValidator validator =
                        Foundries.defaultInstance().createValidator(flavour, false);
                ValidationResult result = validator.validate(parser);

                PDFAFlavour declaredForResult =
                        PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A)
                                ? parserDeclared
                                : flavour;

                results.add(convertToVerificationResult(result, declaredForResult, flavour));
            } catch (Exception e) {
                log.error("Error validating standard {}: {}", flavour.getId(), e.getMessage());
                results.add(
                        buildErrorResult(
                                declaredFlavour, flavour, "Validation error: " + e.getMessage()));
            }
        }

        return results;
    }

    private static boolean isPdfaFlavour(PDFAFlavour flavour) {
        return PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A);
    }

    private static String formatStandardDisplay(
            String baseName,
            int errorCount,
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
