package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PdfToBookRequest")
class PdfToBookRequestTest {

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
            PdfToBookRequest req = new PdfToBookRequest();
            MultipartFile f = file();
            req.setOutputFormat("epub");
            req.setFileInput(f);
            req.setFileId("file-1");

            assertThat(req.getOutputFormat()).isEqualTo("epub");
            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getFileId()).isEqualTo("file-1");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            PdfToBookRequest a = new PdfToBookRequest();
            PdfToBookRequest b = new PdfToBookRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PdfToBookRequest a = new PdfToBookRequest();
            PdfToBookRequest b = new PdfToBookRequest();
            b.setOutputFormat("mobi");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("differing inherited field breaks equality")
        void notEqualInherited() {
            PdfToBookRequest a = new PdfToBookRequest();
            PdfToBookRequest b = new PdfToBookRequest();
            b.setFileId("file-x");

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PdfToBookRequest req = new PdfToBookRequest();
            req.setOutputFormat("azw3");

            assertThat(req.toString()).isNotNull().contains("outputFormat=azw3");
        }
    }
}
