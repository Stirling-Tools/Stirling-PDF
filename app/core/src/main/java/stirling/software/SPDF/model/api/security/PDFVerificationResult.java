package stirling.software.SPDF.model.api.security;

import java.util.ArrayList;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PDFVerificationResult {

    private String standard;
    private String standardName;
    private String validationProfile;
    private String validationProfileName;
    private String complianceSummary;
    private boolean declaredPdfa;
    private boolean compliant;
    private int totalFailures;
    private int totalWarnings;
    private List<ValidationIssue> failures = new ArrayList<>();
    private List<ValidationIssue> warnings = new ArrayList<>();

    public void addFailure(ValidationIssue failure) {
        this.failures.add(failure);
        this.totalFailures = this.failures.size();
    }

    public void addWarning(ValidationIssue warning) {
        this.warnings.add(warning);
        this.totalWarnings = this.warnings.size();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ValidationIssue {
        private String ruleId;
        private String message;
        private String location;
        private String specification;
        private String clause;
        private String testNumber;
    }
}
