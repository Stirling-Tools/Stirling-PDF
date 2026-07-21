package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfVectorExportRequest")
class PdfVectorExportRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("outputFormat defaults to eps and prepress to null")
        void defaultValues() {
            PdfVectorExportRequest req = new PdfVectorExportRequest();

            assertThat(req.getOutputFormat()).isEqualTo("eps");
            assertThat(req.getPrepress()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            PdfVectorExportRequest req = new PdfVectorExportRequest();
            req.setOutputFormat("xps");
            req.setPrepress(Boolean.TRUE);

            assertThat(req.getOutputFormat()).isEqualTo("xps");
            assertThat(req.getPrepress()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfVectorExportRequest a = new PdfVectorExportRequest();
            PdfVectorExportRequest b = new PdfVectorExportRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing outputFormat breaks equality")
        void notEqualFormat() {
            PdfVectorExportRequest a = new PdfVectorExportRequest();
            PdfVectorExportRequest b = new PdfVectorExportRequest();
            b.setOutputFormat("ps");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("differing prepress breaks equality")
        void notEqualPrepress() {
            PdfVectorExportRequest a = new PdfVectorExportRequest();
            PdfVectorExportRequest b = new PdfVectorExportRequest();
            b.setPrepress(Boolean.TRUE);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfVectorExportRequest req = new PdfVectorExportRequest();
            req.setOutputFormat("pcl");

            assertThat(req.toString()).isNotNull().contains("outputFormat=pcl");
        }
    }
}
