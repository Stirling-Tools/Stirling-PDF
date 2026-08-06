package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * What the redaction does and does not catch. Best-effort by design, so these pin the boundary
 * rather than claim completeness: a case that is only partly redacted is asserted as such.
 */
class FilenameRedactionTest {

    @ParameterizedTest
    @DisplayName("names are removed, whatever shape they come in")
    @ValueSource(
            strings = {
                "Failed on report (final).pdf",
                "Failed on \"Q3 Layoff List.pdf\"",
                "Failed on /srv/in/Q3 Layoff List.pdf",
                "Failed on severance-agreement.pdf.gz",
                "Failed on termination.tar.gz",
                "Failed on \u5c65\u6b74\u66f8.pdf",
                "Failed on \u043e\u0442\u0447\u0451\u0442-\u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0430.pdf",
                "Failed on payslip%20march.pdf",
                "Failed on invoice_2024.pdf",
                "Failed on 'end of year (2024).xlsx'",
                "Failed on C:\\Users\\dana\\Q4 Report.docx",
                "Failed on Smith & Co - agreement.pdf",
                "Failed on ../tmp/upload.PDF",
            })
    void areRedacted(String text) {
        assertThat(FilenameRedaction.attemptRedaction(text))
                .doesNotContainIgnoringCase(".pdf")
                .doesNotContainIgnoringCase(".xlsx")
                .doesNotContainIgnoringCase(".docx")
                .contains(FilenameRedaction.PLACEHOLDER);
    }

    @ParameterizedTest
    @DisplayName("text that only looks like a name is left alone")
    @ValueSource(
            strings = {
                "Policy run failed: java.lang.NullPointerException",
                "version v2.14.2 released",
                "The PDF Document is passworded",
            })
    void areLeftAlone(String text) {
        assertThat(FilenameRedaction.attemptRedaction(text)).isEqualTo(text);
    }

    @Test
    @DisplayName("an undelimited spaced name is only partly removed")
    void anUndelimitedSpacedNameIsPartlyRedacted() {
        // The known gap. Crossing spaces without a delimiter would swallow the sentence too, and
        // "<file>" on its own tells a reader nothing about what failed.
        //
        // TODO: harden. This asserts current behaviour, not desired behaviour. Somewhere that can
        // avoid holding the name at all should do that rather than lean on this.
        String redacted = FilenameRedaction.attemptRedaction("Failed on Q3 Layoff List.pdf");

        assertThat(redacted).doesNotContain(".pdf").doesNotContain("List");
        assertThat(redacted).as("a fragment survives, for now").contains("Q3 Layoff");
    }

    @Test
    void nullInNullOut() {
        assertThat(FilenameRedaction.attemptRedaction(null)).isNull();
    }
}
