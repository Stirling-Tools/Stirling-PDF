package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonImageElement")
class PdfJsonImageElementTest {

    @Nested
    @DisplayName("construction")
    class Construction {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            PdfJsonImageElement e = new PdfJsonImageElement();
            assertThat(e.getId()).isNull();
            assertThat(e.getTransform()).isNull();
        }

        @Test
        @DisplayName("builder sets scalar and array fields")
        void builder() {
            PdfJsonImageElement e =
                    PdfJsonImageElement.builder()
                            .id("img1")
                            .objectName("Im0")
                            .inlineImage(false)
                            .nativeWidth(100)
                            .nativeHeight(200)
                            .x(1f)
                            .y(2f)
                            .width(3f)
                            .height(4f)
                            .left(5f)
                            .right(6f)
                            .top(7f)
                            .bottom(8f)
                            .transform(new float[] {1f, 0f, 0f, 1f, 0f, 0f})
                            .zOrder(2)
                            .imageData("base64")
                            .imageFormat("png")
                            .build();

            assertThat(e.getId()).isEqualTo("img1");
            assertThat(e.getObjectName()).isEqualTo("Im0");
            assertThat(e.getInlineImage()).isFalse();
            assertThat(e.getNativeWidth()).isEqualTo(100);
            assertThat(e.getNativeHeight()).isEqualTo(200);
            assertThat(e.getX()).isEqualTo(1f);
            assertThat(e.getY()).isEqualTo(2f);
            assertThat(e.getWidth()).isEqualTo(3f);
            assertThat(e.getHeight()).isEqualTo(4f);
            assertThat(e.getLeft()).isEqualTo(5f);
            assertThat(e.getRight()).isEqualTo(6f);
            assertThat(e.getTop()).isEqualTo(7f);
            assertThat(e.getBottom()).isEqualTo(8f);
            assertThat(e.getTransform()).containsExactly(1f, 0f, 0f, 1f, 0f, 0f);
            assertThat(e.getZOrder()).isEqualTo(2);
            assertThat(e.getImageData()).isEqualTo("base64");
            assertThat(e.getImageFormat()).isEqualTo("png");
        }

        @Test
        @DisplayName("setters round-trip")
        void setters() {
            PdfJsonImageElement e = new PdfJsonImageElement();
            e.setId("x");
            e.setWidth(9f);
            assertThat(e.getId()).isEqualTo("x");
            assertThat(e.getWidth()).isEqualTo(9f);
        }
    }

    @Nested
    @DisplayName("equality")
    class Equality {

        // Lombok deep-compares float[] via Arrays.equals.
        @Test
        @DisplayName("equal content arrays equal; different content not")
        void arrayEquality() {
            PdfJsonImageElement a =
                    PdfJsonImageElement.builder().id("i").transform(new float[] {1f, 2f}).build();
            PdfJsonImageElement b =
                    PdfJsonImageElement.builder().id("i").transform(new float[] {1f, 2f}).build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonImageElement c =
                    PdfJsonImageElement.builder().id("i").transform(new float[] {9f}).build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            PdfJsonImageElement a = PdfJsonImageElement.builder().id("imgId").build();
            assertThat(a.toString()).contains("PdfJsonImageElement").contains("imgId");
        }
    }
}
