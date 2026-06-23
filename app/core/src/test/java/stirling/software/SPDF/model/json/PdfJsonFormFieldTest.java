package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonFormField")
class PdfJsonFormFieldTest {

    @Nested
    @DisplayName("construction")
    class Construction {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            PdfJsonFormField f = new PdfJsonFormField();
            assertThat(f.getName()).isNull();
            assertThat(f.getRect()).isNull();
            assertThat(f.getSelectedIndices()).isNull();
            assertThat(f.getOptions()).isNull();
        }

        @Test
        @DisplayName("builder sets scalar, list and array fields")
        void builder() {
            PdfJsonFormField f =
                    PdfJsonFormField.builder()
                            .name("form1.text1")
                            .partialName("text1")
                            .fieldType("Tx")
                            .value("hello")
                            .defaultValue("default")
                            .flags(2)
                            .alternateFieldName("alt")
                            .mappingName("map")
                            .pageNumber(1)
                            .rect(new float[] {0f, 0f, 100f, 20f})
                            .options(List.of("A", "B"))
                            .selectedIndices(new int[] {0, 1})
                            .checked(true)
                            .fontName("Helv")
                            .fontSize(12f)
                            .build();

            assertThat(f.getName()).isEqualTo("form1.text1");
            assertThat(f.getPartialName()).isEqualTo("text1");
            assertThat(f.getFieldType()).isEqualTo("Tx");
            assertThat(f.getValue()).isEqualTo("hello");
            assertThat(f.getDefaultValue()).isEqualTo("default");
            assertThat(f.getFlags()).isEqualTo(2);
            assertThat(f.getAlternateFieldName()).isEqualTo("alt");
            assertThat(f.getMappingName()).isEqualTo("map");
            assertThat(f.getPageNumber()).isEqualTo(1);
            assertThat(f.getRect()).containsExactly(0f, 0f, 100f, 20f);
            assertThat(f.getOptions()).containsExactly("A", "B");
            assertThat(f.getSelectedIndices()).containsExactly(0, 1);
            assertThat(f.getChecked()).isTrue();
            assertThat(f.getFontName()).isEqualTo("Helv");
            assertThat(f.getFontSize()).isEqualTo(12f);
        }

        @Test
        @DisplayName("setters round-trip")
        void setters() {
            PdfJsonFormField f = new PdfJsonFormField();
            f.setName("n");
            f.setChecked(false);
            assertThat(f.getName()).isEqualTo("n");
            assertThat(f.getChecked()).isFalse();
        }
    }

    @Nested
    @DisplayName("equality")
    class Equality {

        // Lombok deep-compares int[] via Arrays.equals.
        @Test
        @DisplayName("equal content arrays equal; different content not")
        void arrayEquality() {
            PdfJsonFormField a =
                    PdfJsonFormField.builder().name("f").selectedIndices(new int[] {1, 2}).build();
            PdfJsonFormField b =
                    PdfJsonFormField.builder().name("f").selectedIndices(new int[] {1, 2}).build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonFormField c =
                    PdfJsonFormField.builder().name("f").selectedIndices(new int[] {9}).build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            PdfJsonFormField a = PdfJsonFormField.builder().name("fieldName").build();
            assertThat(a.toString()).contains("PdfJsonFormField").contains("fieldName");
        }
    }
}
