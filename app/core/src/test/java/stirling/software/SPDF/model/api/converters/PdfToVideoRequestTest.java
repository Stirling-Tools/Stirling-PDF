package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfToVideoRequest")
class PdfToVideoRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("request initializes documented default values")
        void defaultValues() {
            PdfToVideoRequest req = new PdfToVideoRequest();

            assertThat(req.getVideoFormat()).isEqualTo("mp4");
            assertThat(req.getSecondsPerPage()).isEqualTo(3);
            assertThat(req.getResolution()).isEqualTo("ORIGINAL");
            assertThat(req.getDpi()).isEqualTo(150);
            assertThat(req.getOpacity()).isEqualTo(0.1f);
            assertThat(req.getWatermarkText()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            PdfToVideoRequest req = new PdfToVideoRequest();
            req.setVideoFormat("webm");
            req.setSecondsPerPage(5);
            req.setResolution("720p");
            req.setDpi(300);
            req.setOpacity(0.5f);
            req.setWatermarkText("Stirling Software");

            assertThat(req.getVideoFormat()).isEqualTo("webm");
            assertThat(req.getSecondsPerPage()).isEqualTo(5);
            assertThat(req.getResolution()).isEqualTo("720p");
            assertThat(req.getDpi()).isEqualTo(300);
            assertThat(req.getOpacity()).isEqualTo(0.5f);
            assertThat(req.getWatermarkText()).isEqualTo("Stirling Software");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfToVideoRequest a = new PdfToVideoRequest();
            PdfToVideoRequest b = new PdfToVideoRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            PdfToVideoRequest a = new PdfToVideoRequest();
            PdfToVideoRequest b = new PdfToVideoRequest();
            b.setVideoFormat("webm");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("differing float opacity breaks equality")
        void notEqualOpacity() {
            PdfToVideoRequest a = new PdfToVideoRequest();
            PdfToVideoRequest b = new PdfToVideoRequest();
            b.setOpacity(0.9f);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfToVideoRequest req = new PdfToVideoRequest();
            req.setResolution("480p");

            assertThat(req.toString()).isNotNull().contains("resolution=480p");
        }
    }
}
