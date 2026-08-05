package stirling.software.SPDF.model.api.ua;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Outcome of validating a document against one PDF/UA profile.
 *
 * @param compliant true when every automated check passed; it does not mean the document is usable
 *     by assistive technology, which only a person can judge
 * @param totalFailures raw failure count before grouping by rule
 */
@Schema(description = "Result of validating a document against a PDF/UA profile")
public record UaValidationResult(
        String profile, boolean compliant, List<AccessibilityIssue> issues, int totalFailures) {

    public boolean hasIssues() {
        return !issues.isEmpty();
    }
}
