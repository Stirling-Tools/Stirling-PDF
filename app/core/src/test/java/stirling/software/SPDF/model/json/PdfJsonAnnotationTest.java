package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonAnnotation")
class PdfJsonAnnotationTest {

    @Nested
    @DisplayName("construction")
    class Construction {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            PdfJsonAnnotation a = new PdfJsonAnnotation();
            assertThat(a.getSubtype()).isNull();
            assertThat(a.getRect()).isNull();
            assertThat(a.getRawData()).isNull();
        }

        @Test
        @DisplayName("builder sets scalar and array fields")
        void builder() {
            PdfJsonAnnotation a =
                    PdfJsonAnnotation.builder()
                            .subtype("Highlight")
                            .contents("note")
                            .rect(new float[] {0f, 0f, 10f, 10f})
                            .color(new float[] {1f, 1f, 0f})
                            .flags(4)
                            .destination("page2")
                            .iconName("Comment")
                            .subject("subj")
                            .author("Alice")
                            .creationDate("2025-01-01")
                            .modificationDate("2026-01-01")
                            .build();

            assertThat(a.getSubtype()).isEqualTo("Highlight");
            assertThat(a.getContents()).isEqualTo("note");
            assertThat(a.getRect()).containsExactly(0f, 0f, 10f, 10f);
            assertThat(a.getColor()).containsExactly(1f, 1f, 0f);
            assertThat(a.getFlags()).isEqualTo(4);
            assertThat(a.getDestination()).isEqualTo("page2");
            assertThat(a.getIconName()).isEqualTo("Comment");
            assertThat(a.getSubject()).isEqualTo("subj");
            assertThat(a.getAuthor()).isEqualTo("Alice");
            assertThat(a.getCreationDate()).isEqualTo("2025-01-01");
            assertThat(a.getModificationDate()).isEqualTo("2026-01-01");
            assertThat(a.getRawData()).isNull();
        }

        @Test
        @DisplayName("setters round-trip")
        void setters() {
            PdfJsonAnnotation a = new PdfJsonAnnotation();
            a.setSubtype("Text");
            a.setAuthor("Bob");
            assertThat(a.getSubtype()).isEqualTo("Text");
            assertThat(a.getAuthor()).isEqualTo("Bob");
        }
    }

    @Nested
    @DisplayName("equality")
    class Equality {

        // Lombok deep-compares float[] via Arrays.equals.
        @Test
        @DisplayName("equal content arrays equal; different content not")
        void arrayEquality() {
            PdfJsonAnnotation a =
                    PdfJsonAnnotation.builder()
                            .subtype("Highlight")
                            .rect(new float[] {1f, 2f, 3f, 4f})
                            .build();
            PdfJsonAnnotation b =
                    PdfJsonAnnotation.builder()
                            .subtype("Highlight")
                            .rect(new float[] {1f, 2f, 3f, 4f})
                            .build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonAnnotation c =
                    PdfJsonAnnotation.builder()
                            .subtype("Highlight")
                            .rect(new float[] {9f, 9f, 9f, 9f})
                            .build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            PdfJsonAnnotation a = PdfJsonAnnotation.builder().subtype("Stamp").build();
            assertThat(a.toString()).contains("PdfJsonAnnotation").contains("Stamp");
        }
    }
}
