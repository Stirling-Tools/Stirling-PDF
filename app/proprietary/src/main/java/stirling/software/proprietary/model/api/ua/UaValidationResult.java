package stirling.software.proprietary.model.api.ua;

import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * One PDF/UA validation. compliant means every automated check passed, not that the file is usable;
 * totalChecks counts all checks run, and rulesInProfile and rulesByTags count the profile's rules.
 * validationError is null when veraPDF ran; otherwise the counts are zero and issues holds one
 * entry describing the failure, so nothing about the document itself is known.
 */
@Schema(description = "Result of validating a document against a PDF/UA profile")
public record UaValidationResult(
        String profile,
        boolean compliant,
        List<AccessibilityIssue> issues,
        int totalFailures,
        int totalChecks,
        int rulesInProfile,
        Map<String, Integer> rulesByTags,
        String validationError) {

    public boolean hasIssues() {
        return !issues.isEmpty();
    }
}
