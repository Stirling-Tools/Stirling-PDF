package stirling.software.proprietary.service.ua;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.PDFAValidator;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;
import org.verapdf.pdfa.validation.profiles.Reference;
import org.verapdf.pdfa.validation.profiles.Rule;
import org.verapdf.pdfa.validation.profiles.RuleId;
import org.verapdf.pdfa.validation.profiles.ValidationProfile;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.api.ua.AccessibilityIssue;
import stirling.software.proprietary.model.api.ua.UaValidationResult;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;

/**
 * Validates a document against a PDF/UA profile using veraPDF, the oracle a conversion is declared
 * against. It checks only the machine-verifiable subset, so a clean result is not "accessible".
 */
@Service
@Slf4j
public class PdfUaValidationService {

    /** Plain-English text and remediability for the clauses users actually hit. */
    private static final Map<String, ClauseInfo> CLAUSES = buildClauseTable();

    /**
     * Failures kept per rule, the sample pages come from; totals stay exact. -1 would keep 10,000
     * in all, letting the first rules checked crowd out the rest.
     */
    private static final int MAX_FAILURES_KEPT_PER_RULE = 100;

    /** veraPDF locations name a page as {@code pages[n]}, zero-based, in the object context. */
    private static final Pattern PAGE_IN_CONTEXT = Pattern.compile("pages\\[(\\d+)\\]");

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

            PDFAValidator validator =
                    Foundries.defaultInstance()
                            .createValidator(
                                    flavour, MAX_FAILURES_KEPT_PER_RULE, false, true, false);
            ValidationResult result = validator.validate(parser);
            return toResult(profile, result);

        } catch (Exception e) {
            log.warn("PDF/UA validation failed for {}: {}", profile.displayName(), e.getMessage());
            AccessibilityIssue issue = new AccessibilityIssue();
            issue.setMessage("Validation could not run: " + e.getMessage());
            issue.setSeverity("error");
            issue.setClause("n/a");
            return new UaValidationResult(
                    profile.displayName(), false, List.of(issue), 0, 0, 0, issue.getMessage());
        }
    }

    public static PDFAFlavour flavourFor(PdfUaProfile profile) {
        return profile == PdfUaProfile.UA2 ? PDFAFlavour.PDFUA_2 : PDFAFlavour.PDFUA_1;
    }

    /**
     * Whether the bytes really validate as PDF/A level A for the given part. Tagging is necessary
     * for level A but not sufficient, so the claim is only written once veraPDF agrees.
     */
    public boolean validatesAsPdfaLevelA(byte[] pdfBytes, int part) {
        PDFAFlavour flavour =
                switch (part) {
                    case 1 -> PDFAFlavour.PDFA_1_A;
                    case 2 -> PDFAFlavour.PDFA_2_A;
                    case 3 -> PDFAFlavour.PDFA_3_A;
                    default -> null;
                };
        if (flavour == null) {
            log.warn("No PDF/A level A flavour for part {}", part);
            return false;
        }
        try (PDFAParser parser =
                Foundries.defaultInstance()
                        .createParser(new ByteArrayInputStream(pdfBytes), flavour)) {
            PDFAValidator validator = Foundries.defaultInstance().createValidator(flavour, false);
            return validator.validate(parser).isCompliant();
        } catch (Exception e) {
            log.warn("Level A validation could not run: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Groups repeated failures of the same rule so a report lists issues, not thousands of lines.
     */
    private static UaValidationResult toResult(PdfUaProfile profile, ValidationResult result) {
        Map<String, AccessibilityIssue> grouped = new LinkedHashMap<>();
        Map<String, Set<Integer>> pagesByKey = new LinkedHashMap<>();
        Map<String, RuleId> ruleIdByKey = new LinkedHashMap<>();
        ValidationProfile validationProfile = result.getValidationProfile();
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
            if (assertion.getRuleId() != null) {
                ruleIdByKey.putIfAbsent(key, assertion.getRuleId());
            }

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
                                created.setErrorMessage(assertion.getErrorMessage());
                                describeRule(created, validationProfile, assertion);
                                return created;
                            });
            issue.setOccurrences(issue.getOccurrences() + 1);
            if (issue.getLocation() == null && assertion.getLocation() != null) {
                issue.setLocation(assertion.getLocation().toString());
            }
            Integer page = pageOf(assertion);
            if (page != null) {
                pagesByKey.computeIfAbsent(key, k -> new TreeSet<>()).add(page);
            }
        }
        pagesByKey.forEach((key, pages) -> grouped.get(key).setPages(List.copyOf(pages)));
        total = applyFullFailureCounts(grouped, ruleIdByKey, result.getFailedChecks(), total);

        List<AccessibilityIssue> issues = new ArrayList<>(grouped.values());
        int rulesInProfile = validationProfile != null ? validationProfile.getRules().size() : 0;
        return new UaValidationResult(
                profile.displayName(),
                result.isCompliant() && total == 0,
                issues,
                total,
                result.getTotalAssertions(),
                rulesInProfile,
                null);
    }

    /**
     * Swaps logged counts for veraPDF's per-rule totals and marks capped page lists incomplete,
     * since it logs at most 100 assertions per rule. Returns the corrected total.
     */
    static int applyFullFailureCounts(
            Map<String, AccessibilityIssue> grouped,
            Map<String, RuleId> ruleIdByKey,
            Map<RuleId, Integer> failedChecks,
            int loggedTotal) {
        if (failedChecks == null || failedChecks.isEmpty()) {
            return loggedTotal;
        }
        int total = 0;
        for (Map.Entry<String, AccessibilityIssue> entry : grouped.entrySet()) {
            AccessibilityIssue issue = entry.getValue();
            RuleId ruleId = ruleIdByKey.get(entry.getKey());
            Integer count = ruleId == null ? null : failedChecks.get(ruleId);
            if (count != null && count > issue.getOccurrences()) {
                issue.setOccurrences(count);
                issue.setPagesComplete(false);
            }
            total += issue.getOccurrences();
        }
        return total;
    }

    private static void describeRule(
            AccessibilityIssue issue,
            ValidationProfile validationProfile,
            TestAssertion assertion) {
        if (validationProfile == null || assertion.getRuleId() == null) {
            return;
        }
        Rule rule = validationProfile.getRuleByRuleId(assertion.getRuleId());
        if (rule == null) {
            return;
        }
        issue.setTags(rule.getTagsSet() != null ? List.copyOf(rule.getTagsSet()) : List.of());
        issue.setObject(rule.getObject());
        issue.setTest(rule.getTest());
        if (rule.getReferences() != null) {
            issue.setReferences(
                    rule.getReferences().stream()
                            .map(PdfUaValidationService::formatReference)
                            .toList());
        }
    }

    private static String formatReference(Reference reference) {
        String clause = reference.getClause();
        return clause == null || clause.isBlank()
                ? reference.getSpecification()
                : reference.getSpecification() + " " + clause;
    }

    /** One-based page of an assertion, or null for a document-level one. */
    static Integer pageOf(TestAssertion assertion) {
        if (assertion.getLocation() == null || assertion.getLocation().getContext() == null) {
            return null;
        }
        Matcher matcher = PAGE_IN_CONTEXT.matcher(assertion.getLocation().getContext());
        return matcher.find() ? Integer.parseInt(matcher.group(1)) + 1 : null;
    }

    /**
     * Finds the most specific entry covering a clause by walking up the dotted hierarchy. String
     * prefixes would be wrong: {@code 7.1} prefixes {@code 7.18.1} without being its ancestor.
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
        // Tagging does not touch optional content groups, so this needs the authoring tool.
        table.put("7.10", new ClauseInfo("An optional content group has no name.", false));
        // The attachment's own /AFRelationship and /Desc are not something tagging can supply.
        table.put(
                "7.11",
                new ClauseInfo(
                        "An embedded file is missing its relationship or description.", false));
        table.put(
                "7.15",
                new ClauseInfo(
                        "The document uses a dynamic XFA form, which PDF/UA does not allow.",
                        false));
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
        table.put(
                "7.20",
                new ClauseInfo(
                        "A form or group XObject is not marked as content or as an artifact.",
                        false));
        // Most font defects (CIDFont, CMap, metrics, encoding) need the font itself repaired.
        table.put(
                "7.21",
                new ClauseInfo("A font in the document does not meet PDF/UA rules.", false));
        // The one font defect embedding does fix.
        table.put("7.21.4.1", new ClauseInfo("A font used in the document is not embedded.", true));
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
