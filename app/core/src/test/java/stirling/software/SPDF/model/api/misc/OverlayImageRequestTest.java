package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("OverlayImageRequest")
class OverlayImageRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("documented default field values on a fresh instance")
        void documentedDefaults() {
            OverlayImageRequest req = new OverlayImageRequest();
            assertThat(req.getImageFile()).isNull();
            assertThat(req.getX()).isEqualTo(0f);
            assertThat(req.getY()).isEqualTo(0f);
            assertThat(req.getEveryPage()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            OverlayImageRequest req = new OverlayImageRequest();
            MultipartFile image =
                    new MockMultipartFile("imageFile", "o.png", "image/png", new byte[] {7});
            req.setImageFile(image);
            req.setX(12.5f);
            req.setY(34.25f);
            req.setEveryPage(Boolean.TRUE);

            assertThat(req.getImageFile()).isSameAs(image);
            assertThat(req.getX()).isEqualTo(12.5f);
            assertThat(req.getY()).isEqualTo(34.25f);
            assertThat(req.getEveryPage()).isTrue();
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            OverlayImageRequest req = new OverlayImageRequest();
            req.setFileId("file-6");
            assertThat(req.getFileId()).isEqualTo("file-6");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            OverlayImageRequest a = new OverlayImageRequest();
            OverlayImageRequest b = new OverlayImageRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            OverlayImageRequest a = new OverlayImageRequest();
            OverlayImageRequest b = new OverlayImageRequest();
            b.setEveryPage(Boolean.TRUE);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            OverlayImageRequest a = new OverlayImageRequest();
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
            OverlayImageRequest req = new OverlayImageRequest();
            req.setEveryPage(Boolean.TRUE);
            assertThat(req.toString()).isNotNull().contains("everyPage=true");
        }
    }
}
