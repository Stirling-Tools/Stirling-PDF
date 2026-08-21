package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PdfToTextOrRTFRequest")
class PdfToTextOrRTFRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip subclass and inherited fields")
        void setters() {
            PdfToTextOrRTFRequest req = new PdfToTextOrRTFRequest();
            MultipartFile f = file();
            req.setOutputFormat("txt");
            req.setFileInput(f);

            assertThat(req.getOutputFormat()).isEqualTo("txt");
            assertThat(req.getFileInput()).isSameAs(f);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfToTextOrRTFRequest a = new PdfToTextOrRTFRequest();
            PdfToTextOrRTFRequest b = new PdfToTextOrRTFRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PdfToTextOrRTFRequest a = new PdfToTextOrRTFRequest();
            PdfToTextOrRTFRequest b = new PdfToTextOrRTFRequest();
            b.setOutputFormat("rtf");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfToTextOrRTFRequest req = new PdfToTextOrRTFRequest();
            req.setOutputFormat("rtf");

            assertThat(req.toString()).isNotNull().contains("outputFormat=rtf");
        }
    }
}
