package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PdfToWordRequest")
class PdfToWordRequestTest {

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
            PdfToWordRequest req = new PdfToWordRequest();
            MultipartFile f = file();
            req.setOutputFormat("docx");
            req.setFileInput(f);

            assertThat(req.getOutputFormat()).isEqualTo("docx");
            assertThat(req.getFileInput()).isSameAs(f);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfToWordRequest a = new PdfToWordRequest();
            PdfToWordRequest b = new PdfToWordRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PdfToWordRequest a = new PdfToWordRequest();
            PdfToWordRequest b = new PdfToWordRequest();
            b.setOutputFormat("odt");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfToWordRequest req = new PdfToWordRequest();
            req.setOutputFormat("doc");

            assertThat(req.toString()).isNotNull().contains("outputFormat=doc");
        }
    }
}
