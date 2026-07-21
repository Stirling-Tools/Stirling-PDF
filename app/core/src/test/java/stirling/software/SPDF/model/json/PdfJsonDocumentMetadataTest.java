package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonDocumentMetadata")
class PdfJsonDocumentMetadataTest {

    @Nested
    @DisplayName("construction and defaults")
    class Construction {

        @Test
        @DisplayName("no-arg constructor initializes empty list fields")
        void noArg() {
            PdfJsonDocumentMetadata m = new PdfJsonDocumentMetadata();
            assertThat(m.getFonts()).isEmpty();
            assertThat(m.getPageDimensions()).isEmpty();
            assertThat(m.getFormFields()).isEmpty();
            assertThat(m.getMetadata()).isNull();
            assertThat(m.getXmpMetadata()).isNull();
            assertThat(m.getLazyImages()).isNull();
        }

        @Test
        @DisplayName("builder defaults produce empty lists")
        void builderDefaults() {
            PdfJsonDocumentMetadata m = PdfJsonDocumentMetadata.builder().build();
            assertThat(m.getFonts()).isEmpty();
            assertThat(m.getPageDimensions()).isEmpty();
            assertThat(m.getFormFields()).isEmpty();
        }

        @Test
        @DisplayName("builder sets scalar and list fields")
        void builder() {
            PdfJsonMetadata meta = PdfJsonMetadata.builder().title("T").build();
            List<PdfJsonPageDimension> dims = List.of(new PdfJsonPageDimension(1, 10f, 20f, 0));
            List<PdfJsonFormField> fields = List.of(PdfJsonFormField.builder().name("f").build());

            PdfJsonDocumentMetadata m =
                    PdfJsonDocumentMetadata.builder()
                            .metadata(meta)
                            .xmpMetadata("base64xmp")
                            .lazyImages(true)
                            .pageDimensions(dims)
                            .formFields(fields)
                            .build();

            assertThat(m.getMetadata()).isSameAs(meta);
            assertThat(m.getXmpMetadata()).isEqualTo("base64xmp");
            assertThat(m.getLazyImages()).isTrue();
            assertThat(m.getPageDimensions()).isEqualTo(dims);
            assertThat(m.getFormFields()).isEqualTo(fields);
        }
    }

    @Nested
    @DisplayName("accessors and equality")
    class Behavior {

        @Test
        @DisplayName("setters round-trip")
        void roundTrip() {
            PdfJsonDocumentMetadata m = new PdfJsonDocumentMetadata();
            m.setXmpMetadata("xmp");
            m.setLazyImages(false);
            assertThat(m.getXmpMetadata()).isEqualTo("xmp");
            assertThat(m.getLazyImages()).isFalse();
        }

        @Test
        @DisplayName("equal pair shares hashCode; differs by field")
        void equality() {
            PdfJsonDocumentMetadata a = PdfJsonDocumentMetadata.builder().xmpMetadata("x").build();
            PdfJsonDocumentMetadata b = PdfJsonDocumentMetadata.builder().xmpMetadata("x").build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonDocumentMetadata c = PdfJsonDocumentMetadata.builder().xmpMetadata("y").build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name")
        void toStringContent() {
            assertThat(new PdfJsonDocumentMetadata().toString())
                    .contains("PdfJsonDocumentMetadata");
        }
    }
}
