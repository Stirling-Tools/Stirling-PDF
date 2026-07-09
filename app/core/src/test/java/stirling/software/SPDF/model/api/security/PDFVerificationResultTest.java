package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.PDFVerificationResult.ValidationIssue;

class PDFVerificationResultTest {

    @Nested
    @DisplayName("addFailure")
    class AddFailure {

        @Test
        @DisplayName("appends failure and updates total count")
        void appendsAndCounts() {
            PDFVerificationResult result = new PDFVerificationResult();

            result.addFailure(new ValidationIssue("R1", "broken", null, null, null, null));
            result.addFailure(new ValidationIssue("R2", "also broken", null, null, null, null));

            assertThat(result.getFailures()).hasSize(2);
            assertThat(result.getTotalFailures()).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("addWarning")
    class AddWarning {

        @Test
        @DisplayName("appends warning and updates total count")
        void appendsAndCounts() {
            PDFVerificationResult result = new PDFVerificationResult();

            result.addWarning(new ValidationIssue("W1", "warn", null, null, null, null));

            assertThat(result.getWarnings()).hasSize(1);
            assertThat(result.getTotalWarnings()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters and getters cover scalar fields")
        void scalars() {
            PDFVerificationResult result = new PDFVerificationResult();
            result.setStandard("PDF/A-1B");
            result.setStandardName("PDF/A");
            result.setValidationProfile("1b");
            result.setValidationProfileName("Level B");
            result.setComplianceSummary("ok");
            result.setDeclaredPdfa(true);
            result.setCompliant(true);

            assertThat(result.getStandard()).isEqualTo("PDF/A-1B");
            assertThat(result.getStandardName()).isEqualTo("PDF/A");
            assertThat(result.getValidationProfile()).isEqualTo("1b");
            assertThat(result.getValidationProfileName()).isEqualTo("Level B");
            assertThat(result.getComplianceSummary()).isEqualTo("ok");
            assertThat(result.isDeclaredPdfa()).isTrue();
            assertThat(result.isCompliant()).isTrue();
        }
    }

    @Nested
    @DisplayName("all-args constructor and equality")
    class ConstructorAndEquality {

        @Test
        @DisplayName("all-args constructor populates fields")
        void allArgs() {
            PDFVerificationResult result =
                    new PDFVerificationResult(
                            "std",
                            "stdName",
                            "prof",
                            "profName",
                            "summary",
                            true,
                            false,
                            1,
                            2,
                            new java.util.ArrayList<>(),
                            new java.util.ArrayList<>());

            assertThat(result.getStandard()).isEqualTo("std");
            assertThat(result.getTotalFailures()).isEqualTo(1);
            assertThat(result.getTotalWarnings()).isEqualTo(2);
        }

        @Test
        @DisplayName("equals/hashCode/toString reflect content")
        void equality() {
            PDFVerificationResult a = new PDFVerificationResult();
            PDFVerificationResult b = new PDFVerificationResult();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isNotEqualTo(null).isNotEqualTo("x");
            assertThat(a.toString()).contains("PDFVerificationResult");
        }
    }

    @Nested
    @DisplayName("ValidationIssue nested type")
    class ValidationIssueType {

        @Test
        @DisplayName("exposes every field via accessors")
        void accessors() {
            ValidationIssue issue =
                    new ValidationIssue("rule", "msg", "loc", "spec", "clause", "1.2");

            assertThat(issue.getRuleId()).isEqualTo("rule");
            assertThat(issue.getMessage()).isEqualTo("msg");
            assertThat(issue.getLocation()).isEqualTo("loc");
            assertThat(issue.getSpecification()).isEqualTo("spec");
            assertThat(issue.getClause()).isEqualTo("clause");
            assertThat(issue.getTestNumber()).isEqualTo("1.2");
        }

        @Test
        @DisplayName("no-arg constructor with setters works and equals matches")
        void noArgAndEquals() {
            ValidationIssue issue = new ValidationIssue();
            issue.setRuleId("r");
            ValidationIssue other = new ValidationIssue();
            other.setRuleId("r");

            assertThat(issue.getRuleId()).isEqualTo("r");
            assertThat(issue).isEqualTo(other).hasSameHashCodeAs(other);
        }
    }
}
