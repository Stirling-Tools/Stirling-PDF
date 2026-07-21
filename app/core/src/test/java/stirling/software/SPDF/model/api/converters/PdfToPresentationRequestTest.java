package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PdfToPresentationRequest")
class PdfToPresentationRequestTest {

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
            PdfToPresentationRequest req = new PdfToPresentationRequest();
            MultipartFile f = file();
            req.setOutputFormat("pptx");
            req.setFileInput(f);

            assertThat(req.getOutputFormat()).isEqualTo("pptx");
            assertThat(req.getFileInput()).isSameAs(f);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfToPresentationRequest a = new PdfToPresentationRequest();
            PdfToPresentationRequest b = new PdfToPresentationRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PdfToPresentationRequest a = new PdfToPresentationRequest();
            PdfToPresentationRequest b = new PdfToPresentationRequest();
            b.setOutputFormat("odp");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfToPresentationRequest req = new PdfToPresentationRequest();
            req.setOutputFormat("ppt");

            assertThat(req.toString()).isNotNull().contains("outputFormat=ppt");
        }
    }
}
