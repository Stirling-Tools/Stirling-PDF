package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.OutputFormat;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.TargetDevice;

class ConvertPdfToEpubRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("request initializes documented default values")
        void defaultValues() {
            ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();

            assertThat(req.getDetectChapters()).isTrue();
            assertThat(req.getTargetDevice()).isEqualTo(TargetDevice.TABLET_PHONE_IMAGES);
            assertThat(req.getOutputFormat()).isEqualTo(OutputFormat.EPUB);
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters update every field")
        void setters() {
            ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();
            req.setDetectChapters(Boolean.FALSE);
            req.setTargetDevice(TargetDevice.KINDLE_EINK_TEXT);
            req.setOutputFormat(OutputFormat.AZW3);

            assertThat(req.getDetectChapters()).isFalse();
            assertThat(req.getTargetDevice()).isEqualTo(TargetDevice.KINDLE_EINK_TEXT);
            assertThat(req.getOutputFormat()).isEqualTo(OutputFormat.AZW3);
        }
    }

    @Nested
    @DisplayName("TargetDevice enum")
    class TargetDeviceEnum {

        @Test
        @DisplayName("exposes calibre profile per device")
        void calibreProfiles() {
            assertThat(TargetDevice.TABLET_PHONE_IMAGES.getCalibreProfile()).isEqualTo("tablet");
            assertThat(TargetDevice.KINDLE_EINK_TEXT.getCalibreProfile()).isEqualTo("kindle");
        }

        @Test
        @DisplayName("valueOf round trips")
        void valueOf() {
            assertThat(TargetDevice.valueOf("KINDLE_EINK_TEXT"))
                    .isSameAs(TargetDevice.KINDLE_EINK_TEXT);
            assertThat(TargetDevice.values()).hasSize(2);
        }
    }

    @Nested
    @DisplayName("OutputFormat enum")
    class OutputFormatEnum {

        @Test
        @DisplayName("exposes extension and media type per format")
        void formatMetadata() {
            assertThat(OutputFormat.EPUB.getExtension()).isEqualTo("epub");
            assertThat(OutputFormat.EPUB.getMediaType()).isEqualTo("application/epub+zip");
            assertThat(OutputFormat.AZW3.getExtension()).isEqualTo("azw3");
            assertThat(OutputFormat.AZW3.getMediaType()).isEqualTo("application/vnd.amazon.ebook");
        }

        @Test
        @DisplayName("valueOf round trips")
        void valueOf() {
            assertThat(OutputFormat.valueOf("AZW3")).isSameAs(OutputFormat.AZW3);
            assertThat(OutputFormat.values()).hasSize(2);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            ConvertPdfToEpubRequest a = new ConvertPdfToEpubRequest();
            ConvertPdfToEpubRequest b = new ConvertPdfToEpubRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a.toString()).isNotNull();
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            ConvertPdfToEpubRequest a = new ConvertPdfToEpubRequest();
            ConvertPdfToEpubRequest b = new ConvertPdfToEpubRequest();
            b.setOutputFormat(OutputFormat.AZW3);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }
    }
}
