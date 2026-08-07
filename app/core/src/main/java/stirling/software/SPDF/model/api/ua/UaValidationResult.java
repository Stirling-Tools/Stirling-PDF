package stirling.software.SPDF.model.api.ua;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Outcome of validating against one PDF/UA profile. compliant means every automated check passed,
 * which is not the same as usable by assistive technology; totalFailures is ungrouped.
 */
@Schema(description = "Result of validating a document against a PDF/UA profile")
public record UaValidationResult(
        String profile, boolean compliant, List<AccessibilityIssue> issues, int totalFailures) {

    public boolean hasIssues() {
        return !issues.isEmpty();
    }
}
