package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfToPdfARequest")
class PdfToPdfARequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("strict defaults to false and outputFormat to null")
        void defaultValues() {
            PdfToPdfARequest req = new PdfToPdfARequest();

            assertThat(req.getStrict()).isFalse();
            assertThat(req.getOutputFormat()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            PdfToPdfARequest req = new PdfToPdfARequest();
            req.setOutputFormat("pdfa");
            req.setStrict(Boolean.TRUE);

            assertThat(req.getOutputFormat()).isEqualTo("pdfa");
            assertThat(req.getStrict()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfToPdfARequest a = new PdfToPdfARequest();
            PdfToPdfARequest b = new PdfToPdfARequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing outputFormat breaks equality")
        void notEqualFormat() {
            PdfToPdfARequest a = new PdfToPdfARequest();
            PdfToPdfARequest b = new PdfToPdfARequest();
            b.setOutputFormat("pdfx");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("differing strict breaks equality")
        void notEqualStrict() {
            PdfToPdfARequest a = new PdfToPdfARequest();
            PdfToPdfARequest b = new PdfToPdfARequest();
            b.setStrict(Boolean.TRUE);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfToPdfARequest req = new PdfToPdfARequest();
            req.setOutputFormat("pdfa-2b");

            assertThat(req.toString()).isNotNull().contains("outputFormat=pdfa-2b");
        }
    }
}
