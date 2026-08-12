package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ExtractImageScansRequest")
class ExtractImageScansRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("primitive int fields default to 0 and fileInput to null")
        void primitiveDefaults() {
            ExtractImageScansRequest req = new ExtractImageScansRequest();
            assertThat(req.getFileInput()).isNull();
            assertThat(req.getAngleThreshold()).isZero();
            assertThat(req.getTolerance()).isZero();
            assertThat(req.getMinArea()).isZero();
            assertThat(req.getMinContourArea()).isZero();
            assertThat(req.getBorderSize()).isZero();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            ExtractImageScansRequest req = new ExtractImageScansRequest();
            MultipartFile file =
                    new MockMultipartFile("fileInput", "scan.png", "image/png", new byte[] {1});
            req.setFileInput(file);
            req.setAngleThreshold(5);
            req.setTolerance(20);
            req.setMinArea(8000);
            req.setMinContourArea(500);
            req.setBorderSize(1);

            assertThat(req.getFileInput()).isSameAs(file);
            assertThat(req.getAngleThreshold()).isEqualTo(5);
            assertThat(req.getTolerance()).isEqualTo(20);
            assertThat(req.getMinArea()).isEqualTo(8000);
            assertThat(req.getMinContourArea()).isEqualTo(500);
            assertThat(req.getBorderSize()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            ExtractImageScansRequest a = new ExtractImageScansRequest();
            ExtractImageScansRequest b = new ExtractImageScansRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a field differs")
        void differByField() {
            ExtractImageScansRequest a = new ExtractImageScansRequest();
            ExtractImageScansRequest b = new ExtractImageScansRequest();
            b.setTolerance(99);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            ExtractImageScansRequest a = new ExtractImageScansRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null and contains a field value")
        void toStringContainsField() {
            ExtractImageScansRequest req = new ExtractImageScansRequest();
            req.setTolerance(20);
            assertThat(req.toString()).isNotNull().contains("tolerance=20");
        }
    }
}
