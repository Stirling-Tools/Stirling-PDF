package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonFontConversionCandidate")
class PdfJsonFontConversionCandidateTest {

    @Nested
    @DisplayName("construction")
    class Construction {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            PdfJsonFontConversionCandidate c = new PdfJsonFontConversionCandidate();
            assertThat(c.getStrategyId()).isNull();
            assertThat(c.getStatus()).isNull();
            assertThat(c.getGlyphCoverage()).isNull();
        }

        @Test
        @DisplayName("builder sets scalar, enum and array fields")
        void builder() {
            PdfJsonFontConversionCandidate c =
                    PdfJsonFontConversionCandidate.builder()
                            .strategyId("s1")
                            .strategyLabel("Strategy 1")
                            .status(PdfJsonFontConversionStatus.SUCCESS)
                            .message("ok")
                            .synthesizedGlyphs(10)
                            .missingGlyphs(0)
                            .widthDelta(0.5d)
                            .bboxDelta(1.0d)
                            .program("AAA")
                            .programFormat("ttf")
                            .webProgram("BBB")
                            .webProgramFormat("woff")
                            .pdfProgram("CCC")
                            .pdfProgramFormat("cff")
                            .previewImage("PNG")
                            .diagnostics("{}")
                            .glyphCoverage(new int[] {65, 66, 67})
                            .build();

            assertThat(c.getStrategyId()).isEqualTo("s1");
            assertThat(c.getStrategyLabel()).isEqualTo("Strategy 1");
            assertThat(c.getStatus()).isEqualTo(PdfJsonFontConversionStatus.SUCCESS);
            assertThat(c.getMessage()).isEqualTo("ok");
            assertThat(c.getSynthesizedGlyphs()).isEqualTo(10);
            assertThat(c.getMissingGlyphs()).isZero();
            assertThat(c.getWidthDelta()).isEqualTo(0.5d);
            assertThat(c.getBboxDelta()).isEqualTo(1.0d);
            assertThat(c.getProgram()).isEqualTo("AAA");
            assertThat(c.getProgramFormat()).isEqualTo("ttf");
            assertThat(c.getWebProgram()).isEqualTo("BBB");
            assertThat(c.getWebProgramFormat()).isEqualTo("woff");
            assertThat(c.getPdfProgram()).isEqualTo("CCC");
            assertThat(c.getPdfProgramFormat()).isEqualTo("cff");
            assertThat(c.getPreviewImage()).isEqualTo("PNG");
            assertThat(c.getDiagnostics()).isEqualTo("{}");
            assertThat(c.getGlyphCoverage()).containsExactly(65, 66, 67);
        }

        @Test
        @DisplayName("setters round-trip")
        void setters() {
            PdfJsonFontConversionCandidate c = new PdfJsonFontConversionCandidate();
            c.setStrategyId("x");
            c.setStatus(PdfJsonFontConversionStatus.FAILURE);
            assertThat(c.getStrategyId()).isEqualTo("x");
            assertThat(c.getStatus()).isEqualTo(PdfJsonFontConversionStatus.FAILURE);
        }
    }

    @Nested
    @DisplayName("equality")
    class Equality {

        // Lombok deep-compares int[] via Arrays.equals.
        @Test
        @DisplayName("equal content arrays equal; different content not")
        void arrayEquality() {
            PdfJsonFontConversionCandidate a =
                    PdfJsonFontConversionCandidate.builder()
                            .strategyId("s")
                            .glyphCoverage(new int[] {1, 2})
                            .build();
            PdfJsonFontConversionCandidate b =
                    PdfJsonFontConversionCandidate.builder()
                            .strategyId("s")
                            .glyphCoverage(new int[] {1, 2})
                            .build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonFontConversionCandidate c =
                    PdfJsonFontConversionCandidate.builder()
                            .strategyId("s")
                            .glyphCoverage(new int[] {9})
                            .build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            PdfJsonFontConversionCandidate a =
                    PdfJsonFontConversionCandidate.builder().strategyId("stratId").build();
            assertThat(a.toString()).contains("PdfJsonFontConversionCandidate").contains("stratId");
        }
    }
}
