package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;

/**
 * Additional branch coverage for {@link VeraPDFService}: the private result-building helpers across
 * PDF/A, PDF/UA and WTPDF flavours. These exercise the pure mapping logic with mocked veraPDF
 * results, so no document parsing or validation engine is invoked.
 */
@DisplayName("VeraPDFService additional branch tests")
class VeraPDFServiceMoreTest {

    @SuppressWarnings("unchecked")
    private static <T> T invokeStatic(String name, Class<?>[] types, Object... args)
            throws Exception {
        Method m = VeraPDFService.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        try {
            return (T) m.invoke(null, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) {
                throw ex;
            }
            throw new RuntimeException(cause);
        }
    }

    @Nested
    @DisplayName("getStandardName flavour families")
    class StandardName {

        private String name(PDFAFlavour flavour) throws Exception {
            return invokeStatic("getStandardName", new Class<?>[] {PDFAFlavour.class}, flavour);
        }

        @Test
        @DisplayName("PDF/A-4 maps to a PDF/A- name")
        void pdfA4() throws Exception {
            assertThat(name(PDFAFlavour.PDFA_4)).startsWith("PDF/A-");
        }

        @Test
        @DisplayName("PDF/UA-1 maps to a PDF/UA- name")
        void pdfUa1() throws Exception {
            assertThat(name(PDFAFlavour.PDFUA_1)).startsWith("PDF/UA-");
        }

        @Test
        @DisplayName("WTPDF flavour falls through to the raw flavour id")
        void wtpdf() throws Exception {
            // WTPDF ids ("wt1r") do not contain the "wtpdf" token, so the method returns toString()
            assertThat(name(PDFAFlavour.WTPDF_1_0_REUSE))
                    .isEqualTo(PDFAFlavour.WTPDF_1_0_REUSE.toString());
        }
    }

    @Nested
    @DisplayName("isPdfaFlavour")
    class IsPdfa {

        private boolean isPdfa(PDFAFlavour flavour) throws Exception {
            return invokeStatic("isPdfaFlavour", new Class<?>[] {PDFAFlavour.class}, flavour);
        }

        @Test
        @DisplayName("true for PDF/A flavours, false for PDF/UA")
        void families() throws Exception {
            assertThat(isPdfa(PDFAFlavour.PDFA_2_B)).isTrue();
            assertThat(isPdfa(PDFAFlavour.PDFUA_1)).isFalse();
        }
    }

    @Nested
    @DisplayName("buildErrorResult flavour branches")
    class ErrorResult {

        private PDFVerificationResult build(
                PDFAFlavour declared, PDFAFlavour validation, String message) throws Exception {
            return invokeStatic(
                    "buildErrorResult",
                    new Class<?>[] {PDFAFlavour.class, PDFAFlavour.class, String.class},
                    declared,
                    validation,
                    message);
        }

        @Test
        @DisplayName("non-PDF/A validation flavour (PDF/UA) keeps that standard id with errors")
        void uaValidationFlavour() throws Exception {
            PDFVerificationResult result = build(null, PDFAFlavour.PDFUA_1, "broken");
            assertThat(result.isCompliant()).isFalse();
            assertThat(result.getStandardName()).contains("with errors");
            assertThat(result.getValidationProfile()).isEqualTo(PDFAFlavour.PDFUA_1.getId());
            assertThat(result.getFailures()).hasSize(1);
            assertThat(result.getFailures().get(0).getMessage()).isEqualTo("broken");
        }

        @Test
        @DisplayName("PDF/A validation flavour with no declaration maps to not-pdfa standard")
        void pdfaValidationNoDeclaration() throws Exception {
            PDFVerificationResult result = build(null, PDFAFlavour.PDFA_2_B, "oops");
            assertThat(result.getStandard()).isEqualTo("not-pdfa");
            assertThat(result.isDeclaredPdfa()).isFalse();
            assertThat(result.getValidationProfile()).isEqualTo(PDFAFlavour.PDFA_2_B.getId());
        }
    }

    @Nested
    @DisplayName("convertToVerificationResult")
    class ConvertResult {

        private PDFVerificationResult convert(
                ValidationResult result, PDFAFlavour declared, PDFAFlavour validation)
                throws Exception {
            return invokeStatic(
                    "convertToVerificationResult",
                    new Class<?>[] {ValidationResult.class, PDFAFlavour.class, PDFAFlavour.class},
                    result,
                    declared,
                    validation);
        }

        @Test
        @DisplayName("compliant PDF/A result with no failed assertions is marked compliant")
        void compliantPdfa() throws Exception {
            ValidationResult vr = mock(ValidationResult.class);
            lenient().when(vr.isCompliant()).thenReturn(true);
            lenient().when(vr.getPDFAFlavour()).thenReturn(PDFAFlavour.PDFA_2_B);
            when(vr.getTestAssertions()).thenReturn(Collections.emptyList());

            PDFVerificationResult result = convert(vr, PDFAFlavour.PDFA_2_B, PDFAFlavour.PDFA_2_B);

            assertThat(result.isCompliant()).isTrue();
            assertThat(result.isDeclaredPdfa()).isTrue();
            assertThat(result.getStandard()).isEqualTo(PDFAFlavour.PDFA_2_B.getId());
            assertThat(result.getStandardName()).contains("compliant");
            assertThat(result.getTotalFailures()).isZero();
        }

        @Test
        @DisplayName("failed assertions are collected and the result is non-compliant")
        void failedAssertionsCollected() throws Exception {
            TestAssertion failing = mock(TestAssertion.class);
            when(failing.getStatus()).thenReturn(TestAssertion.Status.FAILED);
            lenient().when(failing.getRuleId()).thenReturn(null);
            lenient().when(failing.getMessage()).thenReturn("rule violated");
            lenient().when(failing.getLocation()).thenReturn(null);

            ValidationResult vr = mock(ValidationResult.class);
            lenient().when(vr.isCompliant()).thenReturn(false);
            lenient().when(vr.getPDFAFlavour()).thenReturn(PDFAFlavour.PDFA_2_B);
            when(vr.getTestAssertions()).thenReturn(List.of(failing));

            PDFVerificationResult result = convert(vr, PDFAFlavour.PDFA_2_B, PDFAFlavour.PDFA_2_B);

            assertThat(result.isCompliant()).isFalse();
            assertThat(result.getTotalFailures()).isEqualTo(1);
            assertThat(result.getStandardName()).contains("with errors");
        }

        @Test
        @DisplayName("PDF/UA validation flavour is reported as the declared standard")
        void uaFlavour() throws Exception {
            ValidationResult vr = mock(ValidationResult.class);
            lenient().when(vr.isCompliant()).thenReturn(true);
            lenient().when(vr.getPDFAFlavour()).thenReturn(PDFAFlavour.PDFUA_1);
            when(vr.getTestAssertions()).thenReturn(Collections.emptyList());

            PDFVerificationResult result = convert(vr, PDFAFlavour.PDFUA_1, PDFAFlavour.PDFUA_1);

            assertThat(result.getStandard()).isEqualTo(PDFAFlavour.PDFUA_1.getId());
            assertThat(result.getValidationProfile()).isEqualTo(PDFAFlavour.PDFUA_1.getId());
            assertThat(result.getValidationProfileName()).startsWith("PDF/UA-");
        }
    }

    @Nested
    @DisplayName("createValidationIssue with a populated rule id")
    class ValidationIssue {

        @Test
        @DisplayName("rule id, clause, specification and test number are copied")
        void populatedRuleId() throws Exception {
            org.verapdf.pdfa.validation.profiles.RuleId ruleId =
                    mock(org.verapdf.pdfa.validation.profiles.RuleId.class);
            when(ruleId.getClause()).thenReturn("6.1.2");
            when(ruleId.getTestNumber()).thenReturn(7);
            lenient().when(ruleId.getSpecification()).thenReturn(null);

            TestAssertion assertion = mock(TestAssertion.class);
            when(assertion.getRuleId()).thenReturn(ruleId);
            when(assertion.getMessage()).thenReturn("clause violated");
            lenient().when(assertion.getLocation()).thenReturn(null);

            PDFVerificationResult.ValidationIssue issue =
                    invokeStatic(
                            "createValidationIssue",
                            new Class<?>[] {TestAssertion.class},
                            assertion);

            assertThat(issue.getClause()).isEqualTo("6.1.2");
            assertThat(issue.getTestNumber()).isEqualTo("7");
            assertThat(issue.getMessage()).isEqualTo("clause violated");
        }
    }
}
