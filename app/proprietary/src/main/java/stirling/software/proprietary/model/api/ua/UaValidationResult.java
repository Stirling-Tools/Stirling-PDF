package stirling.software.proprietary.model.api.ua;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * One PDF/UA validation; compliant means every automated check passed, not that the file is usable.
 * validationError is set when veraPDF could not run, and then the counts and issues say nothing.
 */
@Schema(description = "Result of validating a document against a PDF/UA profile")
public record UaValidationResult(
        String profile,
        boolean compliant,
        List<AccessibilityIssue> issues,
        int totalFailures,
        int totalChecks,
        int rulesInProfile,
        String validationError) {

    public boolean hasIssues() {
        return !issues.isEmpty();
    }
}
