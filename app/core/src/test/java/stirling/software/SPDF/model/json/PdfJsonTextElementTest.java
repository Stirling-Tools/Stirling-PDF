package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonTextElement")
class PdfJsonTextElementTest {

    @Nested
    @DisplayName("construction")
    class Construction {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            PdfJsonTextElement e = new PdfJsonTextElement();
            assertThat(e.getText()).isNull();
            assertThat(e.getTextMatrix()).isNull();
            assertThat(e.getCharCodes()).isNull();
            assertThat(e.getFillColor()).isNull();
        }

        @Test
        @DisplayName("builder sets scalar, nested and array fields")
        void builder() {
            PdfJsonTextColor fill =
                    PdfJsonTextColor.builder()
                            .colorSpace("RGB")
                            .components(new float[] {1f})
                            .build();
            PdfJsonTextElement e =
                    PdfJsonTextElement.builder()
                            .text("Hello")
                            .fontId("F1")
                            .fontSize(12f)
                            .fontMatrixSize(1f)
                            .fontSizeInPt(12f)
                            .characterSpacing(0.5f)
                            .wordSpacing(1f)
                            .spaceWidth(2f)
                            .zOrder(1)
                            .horizontalScaling(100f)
                            .leading(14f)
                            .rise(0f)
                            .x(10f)
                            .y(20f)
                            .width(30f)
                            .height(40f)
                            .textMatrix(new float[] {1f, 0f, 0f, 1f, 0f, 0f})
                            .fillColor(fill)
                            .renderingMode(0)
                            .fallbackUsed(false)
                            .charCodes(new int[] {72, 101})
                            .build();

            assertThat(e.getText()).isEqualTo("Hello");
            assertThat(e.getFontId()).isEqualTo("F1");
            assertThat(e.getFontSize()).isEqualTo(12f);
            assertThat(e.getFontMatrixSize()).isEqualTo(1f);
            assertThat(e.getFontSizeInPt()).isEqualTo(12f);
            assertThat(e.getCharacterSpacing()).isEqualTo(0.5f);
            assertThat(e.getWordSpacing()).isEqualTo(1f);
            assertThat(e.getSpaceWidth()).isEqualTo(2f);
            assertThat(e.getZOrder()).isEqualTo(1);
            assertThat(e.getHorizontalScaling()).isEqualTo(100f);
            assertThat(e.getLeading()).isEqualTo(14f);
            assertThat(e.getRise()).isEqualTo(0f);
            assertThat(e.getX()).isEqualTo(10f);
            assertThat(e.getY()).isEqualTo(20f);
            assertThat(e.getWidth()).isEqualTo(30f);
            assertThat(e.getHeight()).isEqualTo(40f);
            assertThat(e.getTextMatrix()).containsExactly(1f, 0f, 0f, 1f, 0f, 0f);
            assertThat(e.getFillColor()).isSameAs(fill);
            assertThat(e.getRenderingMode()).isZero();
            assertThat(e.getFallbackUsed()).isFalse();
            assertThat(e.getCharCodes()).containsExactly(72, 101);
        }

        @Test
        @DisplayName("setters round-trip including stroke color")
        void setters() {
            PdfJsonTextElement e = new PdfJsonTextElement();
            PdfJsonTextColor stroke = PdfJsonTextColor.builder().colorSpace("Gray").build();
            e.setText("t");
            e.setStrokeColor(stroke);
            assertThat(e.getText()).isEqualTo("t");
            assertThat(e.getStrokeColor()).isSameAs(stroke);
        }
    }

    @Nested
    @DisplayName("equality")
    class Equality {

        // Lombok deep-compares int[] via Arrays.equals.
        @Test
        @DisplayName("equal content arrays equal; different content not")
        void arrayEquality() {
            PdfJsonTextElement a =
                    PdfJsonTextElement.builder().text("t").charCodes(new int[] {1, 2}).build();
            PdfJsonTextElement b =
                    PdfJsonTextElement.builder().text("t").charCodes(new int[] {1, 2}).build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonTextElement c =
                    PdfJsonTextElement.builder().text("t").charCodes(new int[] {9}).build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            PdfJsonTextElement a = PdfJsonTextElement.builder().text("TheText").build();
            assertThat(a.toString()).contains("PdfJsonTextElement").contains("TheText");
        }
    }
}
