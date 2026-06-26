package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ConvertPdfToCbzRequest")
class ConvertPdfToCbzRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("dpi defaults to 150")
        void defaultValues() {
            ConvertPdfToCbzRequest req = new ConvertPdfToCbzRequest();

            assertThat(req.getDpi()).isEqualTo(150);
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            ConvertPdfToCbzRequest req = new ConvertPdfToCbzRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setDpi(600);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getDpi()).isEqualTo(600);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            ConvertPdfToCbzRequest a = new ConvertPdfToCbzRequest();
            ConvertPdfToCbzRequest b = new ConvertPdfToCbzRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            ConvertPdfToCbzRequest a = new ConvertPdfToCbzRequest();
            ConvertPdfToCbzRequest b = new ConvertPdfToCbzRequest();
            b.setDpi(72);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ConvertPdfToCbzRequest req = new ConvertPdfToCbzRequest();
            req.setDpi(200);

            assertThat(req.toString()).isNotNull().contains("dpi=200");
        }
    }
}
