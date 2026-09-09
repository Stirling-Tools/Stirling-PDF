package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("AddStampRequest")
class AddStampRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("documented default field values on a fresh instance")
        void documentedDefaults() {
            AddStampRequest req = new AddStampRequest();
            assertThat(req.getAlphabet()).isEqualTo("roman");
            assertThat(req.getStampType()).isNull();
            assertThat(req.getStampText()).isNull();
            assertThat(req.getStampImage()).isNull();
            assertThat(req.getFontSize()).isEqualTo(0f);
            assertThat(req.getRotation()).isEqualTo(0f);
            assertThat(req.getOpacity()).isEqualTo(0f);
            assertThat(req.getPosition()).isZero();
            assertThat(req.getOverrideX()).isEqualTo(0f);
            assertThat(req.getOverrideY()).isEqualTo(0f);
            assertThat(req.getCustomMargin()).isNull();
            assertThat(req.getCustomColor()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            AddStampRequest req = new AddStampRequest();
            MultipartFile image =
                    new MockMultipartFile("stampImage", "s.png", "image/png", new byte[] {9});
            req.setStampType("image");
            req.setStampText("Confidential");
            req.setStampImage(image);
            req.setAlphabet("arabic");
            req.setFontSize(40f);
            req.setRotation(45f);
            req.setOpacity(0.5f);
            req.setPosition(8);
            req.setOverrideX(-1f);
            req.setOverrideY(-1f);
            req.setCustomMargin("medium");
            req.setCustomColor("#d3d3d3");

            assertThat(req.getStampType()).isEqualTo("image");
            assertThat(req.getStampText()).isEqualTo("Confidential");
            assertThat(req.getStampImage()).isSameAs(image);
            assertThat(req.getAlphabet()).isEqualTo("arabic");
            assertThat(req.getFontSize()).isEqualTo(40f);
            assertThat(req.getRotation()).isEqualTo(45f);
            assertThat(req.getOpacity()).isEqualTo(0.5f);
            assertThat(req.getPosition()).isEqualTo(8);
            assertThat(req.getOverrideX()).isEqualTo(-1f);
            assertThat(req.getOverrideY()).isEqualTo(-1f);
            assertThat(req.getCustomMargin()).isEqualTo("medium");
            assertThat(req.getCustomColor()).isEqualTo("#d3d3d3");
        }

        @Test
        @DisplayName("inherited pageNumbers round-trips")
        void inheritedPageNumbersRoundTrip() {
            AddStampRequest req = new AddStampRequest();
            req.setPageNumbers("all");
            assertThat(req.getPageNumbers()).isEqualTo("all");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            AddStampRequest a = new AddStampRequest();
            AddStampRequest b = new AddStampRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            AddStampRequest a = new AddStampRequest();
            AddStampRequest b = new AddStampRequest();
            b.setStampType("text");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            AddStampRequest a = new AddStampRequest();
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
            AddStampRequest req = new AddStampRequest();
            req.setStampType("text");
            assertThat(req.toString()).isNotNull().contains("stampType=text");
        }
    }
}
