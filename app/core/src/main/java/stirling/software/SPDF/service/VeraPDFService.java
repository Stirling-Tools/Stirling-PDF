package stirling.software.SPDF.service;

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

    @PostConstruct
    public void initialize() {
        try {
            VeraGreenfieldFoundryProvider.initialise();
            log.info("veraPDF Greenfield initialized successfully");
        } catch (Exception e) {
            log.error("Failed to initialize veraPDF", e);
        }
    }

    public PDFVerificationResult validatePDF(InputStream pdfStream, String standardString)
            throws IOException, ValidationException, ModelParsingException, EncryptedPdfException {

        PDFAFlavour flavour = PDFAFlavour.fromString(standardString);

        try (PDFAParser parser = Foundries.defaultInstance().createParser(pdfStream, flavour)) {
            PDFAValidator validator = Foundries.defaultInstance().createValidator(flavour, false);
            ValidationResult result = validator.validate(parser);

            return convertToVerificationResult(result);
        }
    }

    public List<PDFVerificationResult> validateAllDeclaredStandards(InputStream pdfStream)
            throws IOException, ValidationException, ModelParsingException, EncryptedPdfException {

        List<PDFVerificationResult> results = new ArrayList<>();

        try (PDFAParser parser = Foundries.defaultInstance().createParser(pdfStream)) {
            List<PDFAFlavour> detectedFlavours = parser.getFlavours();
            List<PDFAFlavour> flavoursToValidate = new ArrayList<>();

            // Filter for PDF/A, PDF/UA, and WTPDF standards
            for (PDFAFlavour flavour : detectedFlavours) {
                if (PDFFlavours.isFlavourFamily(flavour, PDFAFlavour.SpecificationFamily.PDF_A)
                        || PDFFlavours.isFlavourFamily(
                                flavour, PDFAFlavour.SpecificationFamily.PDF_UA)
                        || PDFFlavours.isFlavourFamily(
                                flavour, PDFAFlavour.SpecificationFamily.WTPDF)) {
                    flavoursToValidate.add(flavour);
                }
            }

            if (flavoursToValidate.isEmpty()) {
                log.info("No PDF/A, PDF/UA, or WTPDF standards declared in the document");
                PDFVerificationResult noStandardResult = new PDFVerificationResult();
                noStandardResult.setStandard("none");
                noStandardResult.setStandardName("No standards declared");
                noStandardResult.setCompliant(false);
                noStandardResult.setTotalFailures(0);
                noStandardResult.setTotalWarnings(0);
                results.add(noStandardResult);
                return results;
            }

            for (PDFAFlavour flavour : flavoursToValidate) {
                try {
                    PDFAValidator validator =
                            Foundries.defaultInstance().createValidator(flavour, false);
                    ValidationResult result = validator.validate(parser);
                    results.add(convertToVerificationResult(result));
                } catch (Exception e) {
                    log.error("Error validating standard {}: {}", flavour.getId(), e.getMessage());
                    PDFVerificationResult errorResult = new PDFVerificationResult();
                    errorResult.setStandard(flavour.getId());
                    errorResult.setStandardName(getStandardName(flavour));
                    errorResult.setCompliant(false);
                    errorResult.setTotalFailures(1);
                    errorResult.setTotalWarnings(0);
                    PDFVerificationResult.ValidationIssue failure =
                            new PDFVerificationResult.ValidationIssue();
                    failure.setMessage("Validation error: " + e.getMessage());
                    errorResult.addFailure(failure);
                    results.add(errorResult);
                }
            }
        }

        return results;
    }

    private PDFVerificationResult convertToVerificationResult(ValidationResult result) {
        PDFVerificationResult verificationResult = new PDFVerificationResult();

        PDFAFlavour flavour = result.getPDFAFlavour();
        verificationResult.setStandard(flavour.getId());
        verificationResult.setStandardName(getStandardName(flavour));
        verificationResult.setCompliant(result.isCompliant());

        // Process all assertions and separate errors from warnings
        List<TestAssertion> assertions = result.getTestAssertions();
        int errorCount = 0;
        int warningCount = 0;

        for (TestAssertion assertion : assertions) {
            TestAssertion.Status status = assertion.getStatus();

            // Only process FAILED assertions (PASSED assertions are successful checks)
            if (status == TestAssertion.Status.FAILED) {

                PDFVerificationResult.ValidationIssue issue =
                        new PDFVerificationResult.ValidationIssue();
                issue.setRuleId(assertion.getRuleId().toString());
                issue.setMessage(assertion.getMessage());
                issue.setLocation(
                        assertion.getLocation() != null
                                ? assertion.getLocation().toString()
                                : "Unknown");
                issue.setSpecification(
                        assertion.getRuleId().getSpecification() != null
                                ? assertion.getRuleId().getSpecification().toString()
                                : "");
                issue.setClause(assertion.getRuleId().getClause());
                int testNumber = assertion.getRuleId().getTestNumber();
                issue.setTestNumber(testNumber > 0 ? String.valueOf(testNumber) : "");
                verificationResult.addFailure(issue);
                errorCount++;
            }
        }

        verificationResult.setTotalFailures(errorCount);
        verificationResult.setTotalWarnings(warningCount);

        log.debug(
                "Validation complete for {}: {} errors, {} warnings",
                flavour.getId(),
                errorCount,
                warningCount);

        return verificationResult;
    }

    private String getStandardName(PDFAFlavour flavour) {
        String id = flavour.getId();
        String part = flavour.getPart().toString();
        String level = flavour.getLevel().toString();

        // PDF/A standards
        if (!id.isEmpty() && id.charAt(0) == '1'
                || !id.isEmpty() && id.charAt(0) == '2'
                || !id.isEmpty() && id.charAt(0) == '3'
                || !id.isEmpty() && id.charAt(0) == '4') {
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
