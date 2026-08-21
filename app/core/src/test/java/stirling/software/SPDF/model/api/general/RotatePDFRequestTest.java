package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("RotatePDFRequest")
class RotatePDFRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("angle defaults to 90")
        void defaultValues() {
            RotatePDFRequest req = new RotatePDFRequest();

            assertThat(req.getAngle()).isEqualTo(90);
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            RotatePDFRequest req = new RotatePDFRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setAngle(270);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getAngle()).isEqualTo(270);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            RotatePDFRequest a = new RotatePDFRequest();
            RotatePDFRequest b = new RotatePDFRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            RotatePDFRequest a = new RotatePDFRequest();
            RotatePDFRequest b = new RotatePDFRequest();
            b.setAngle(180);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            RotatePDFRequest req = new RotatePDFRequest();

            assertThat(req.toString()).isNotNull().contains("angle=90");
        }
    }
}
