package stirling.software.SPDF.service.ua;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.PDFAValidator;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.ua.AccessibilityIssue;
import stirling.software.SPDF.model.api.ua.UaValidationResult;
import stirling.software.common.pdf.ua.PdfUaProfile;

/**
 * Validates a document against a PDF/UA profile using veraPDF.
 *
 * <p>This is the oracle the converter is defined against: a conversion succeeds when this reports
 * zero failures, and the {@code pdfuaid} declaration is written only in that case.
 * Hand-interpreting ISO 14289 is not part of the design.
 *
 * <p>veraPDF checks the machine-verifiable subset of the standard. Roughly half the Matterhorn
 * Protocol's failure conditions need a human, so a clean result means "passes automated checks",
 * not "accessible".
 */
@Service
@Slf4j
public class PdfUaValidationService {

    /** Plain-English text and remediability for the clauses users actually hit. */
    private static final Map<String, ClauseInfo> CLAUSES = buildClauseTable();

    record ClauseInfo(String message, boolean autoFixable) {}

    @PostConstruct
    public void initialise() {
        try {
            VeraGreenfieldFoundryProvider.initialise();
        } catch (Exception e) {
            log.error("Failed to initialise veraPDF for PDF/UA validation", e);
        }
    }

    public UaValidationResult validate(byte[] pdfBytes, PdfUaProfile profile) {
        PDFAFlavour flavour = flavourFor(profile);
        try (PDFAParser parser =
                Foundries.defaultInstance()
                        .createParser(new ByteArrayInputStream(pdfBytes), flavour)) {

            PDFAValidator validator = Foundries.defaultInstance().createValidator(flavour, false);
            ValidationResult result = validator.validate(parser);
            return toResult(profile, result);

        } catch (Exception e) {
            log.warn("PDF/UA validation failed for {}: {}", profile.displayName(), e.getMessage());
            AccessibilityIssue issue = new AccessibilityIssue();
            issue.setMessage("Validation could not run: " + e.getMessage());
            issue.setSeverity("error");
            issue.setClause("n/a");
            return new UaValidationResult(profile.displayName(), false, List.of(issue), 0);
        }
    }

    public static PDFAFlavour flavourFor(PdfUaProfile profile) {
        return profile == PdfUaProfile.UA2 ? PDFAFlavour.PDFUA_2 : PDFAFlavour.PDFUA_1;
    }

    /**
     * Groups repeated failures of the same rule so a report lists issues, not thousands of lines.
     */
    private static UaValidationResult toResult(PdfUaProfile profile, ValidationResult result) {
        Map<String, AccessibilityIssue> grouped = new LinkedHashMap<>();
        int total = 0;

        for (TestAssertion assertion : result.getTestAssertions()) {
            if (assertion.getStatus() != TestAssertion.Status.FAILED) {
                continue;
            }
            total++;
            String clause =
                    assertion.getRuleId() != null ? assertion.getRuleId().getClause() : "unknown";
            int test = assertion.getRuleId() != null ? assertion.getRuleId().getTestNumber() : 0;
            String key = clause + "-" + test;

            AccessibilityIssue issue =
                    grouped.computeIfAbsent(
                            key,
                            k -> {
                                AccessibilityIssue created = new AccessibilityIssue();
                                created.setClause(clause);
                                created.setTestNumber(String.valueOf(test));
                                created.setSeverity("error");
                                ClauseInfo info = lookupClause(clause);
                                created.setMessage(
                                        info != null ? info.message() : assertion.getMessage());
                                created.setTechnicalMessage(assertion.getMessage());
                                created.setAutoFixable(info != null && info.autoFixable());
                                created.setSpecification(profile.displayName());
                                return created;
                            });
            issue.setOccurrences(issue.getOccurrences() + 1);
            if (issue.getLocation() == null && assertion.getLocation() != null) {
                issue.setLocation(assertion.getLocation().toString());
            }
        }

        List<AccessibilityIssue> issues = new ArrayList<>(grouped.values());
        return new UaValidationResult(
                profile.displayName(), result.isCompliant() && total == 0, issues, total);
    }

    /**
     * Finds the most specific table entry covering a clause.
     *
     * <p>veraPDF reports subclauses such as {@code 7.21.4.1}, so matching must walk up the dotted
     * hierarchy. Plain string prefixes would be wrong: {@code 7.1} is not an ancestor of {@code
     * 7.18.1}, but it is a string prefix of it.
     */
    static ClauseInfo lookupClause(String clause) {
        if (clause == null) {
            return null;
        }
        String current = clause;
        while (!current.isEmpty()) {
            ClauseInfo info = CLAUSES.get(current);
            if (info != null) {
                return info;
            }
            int dot = current.lastIndexOf('.');
            if (dot < 0) {
                return null;
            }
            current = current.substring(0, dot);
        }
        return null;
    }

    private static Map<String, ClauseInfo> buildClauseTable() {
        Map<String, ClauseInfo> table = new LinkedHashMap<>();
        table.put(
                "7.1",
                new ClauseInfo(
                        "Document is not tagged, or some content is neither tagged nor marked as an artifact.",
                        true));
        table.put(
                "7.2",
                new ClauseInfo(
                        "Text cannot be mapped to Unicode, or the document language is not declared.",
                        true));
        table.put(
                "7.3",
                new ClauseInfo("An image or graphic has no alternative description.", false));
        table.put(
                "7.4",
                new ClauseInfo(
                        "Heading levels skip a level, or headings are nested incorrectly.", true));
        table.put(
                "7.5",
                new ClauseInfo("A table is missing header cells or header associations.", false));
        table.put(
                "7.6", new ClauseInfo("A list is not structured as list items with bodies.", true));
        table.put(
                "7.7",
                new ClauseInfo("A mathematical expression has no alternative description.", false));
        table.put(
                "7.8",
                new ClauseInfo("Running heads or page numbers are not marked as artifacts.", true));
        table.put("7.9", new ClauseInfo("A note is missing a unique identifier.", true));
        table.put("7.10", new ClauseInfo("An optional content group has no name.", true));
        table.put(
                "7.11",
                new ClauseInfo(
                        "An embedded file is missing its relationship or description.", true));
        table.put(
                "7.16",
                new ClauseInfo(
                        "Security settings prevent assistive technology from reading the content.",
                        true));
        table.put("7.17", new ClauseInfo("Navigation aids such as page labels are missing.", true));
        table.put(
                "7.18",
                new ClauseInfo(
                        "An annotation is missing a description, tab order, or structure entry.",
                        true));
        table.put("7.21", new ClauseInfo("A font used in the document is not embedded.", true));
        // ToUnicode gaps need the font itself repaired, which embedding does not do.
        table.put(
                "7.21.7",
                new ClauseInfo(
                        "A font does not map every character it uses to Unicode, so extracted text"
                                + " may be wrong.",
                        false));
        table.put(
                "5",
                new ClauseInfo(
                        "The document does not declare PDF/UA conformance in its XMP metadata.",
                        true));
        return table;
    }
}
