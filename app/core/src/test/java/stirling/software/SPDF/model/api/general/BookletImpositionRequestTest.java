package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("BookletImpositionRequest")
class BookletImpositionRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("documented default field values on a fresh instance")
        void defaultValues() {
            BookletImpositionRequest req = new BookletImpositionRequest();

            assertThat(req.getPagesPerSheet()).isEqualTo(2);
            assertThat(req.getAddBorder()).isFalse();
            assertThat(req.getSpineLocation()).isEqualTo("LEFT");
            assertThat(req.getAddGutter()).isFalse();
            assertThat(req.getGutterSize()).isEqualTo(12f);
            assertThat(req.getDoubleSided()).isTrue();
            assertThat(req.getDuplexPass()).isEqualTo("BOTH");
            assertThat(req.getFlipOnShortEdge()).isFalse();
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            BookletImpositionRequest req = new BookletImpositionRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setFileId("id-1");
            req.setPagesPerSheet(2);
            req.setAddBorder(true);
            req.setSpineLocation("RIGHT");
            req.setAddGutter(true);
            req.setGutterSize(24f);
            req.setDoubleSided(false);
            req.setDuplexPass("FIRST");
            req.setFlipOnShortEdge(true);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getFileId()).isEqualTo("id-1");
            assertThat(req.getPagesPerSheet()).isEqualTo(2);
            assertThat(req.getAddBorder()).isTrue();
            assertThat(req.getSpineLocation()).isEqualTo("RIGHT");
            assertThat(req.getAddGutter()).isTrue();
            assertThat(req.getGutterSize()).isEqualTo(24f);
            assertThat(req.getDoubleSided()).isFalse();
            assertThat(req.getDuplexPass()).isEqualTo("FIRST");
            assertThat(req.getFlipOnShortEdge()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            BookletImpositionRequest a = new BookletImpositionRequest();
            BookletImpositionRequest b = new BookletImpositionRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            BookletImpositionRequest a = new BookletImpositionRequest();
            BookletImpositionRequest b = new BookletImpositionRequest();
            b.setSpineLocation("RIGHT");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            BookletImpositionRequest req = new BookletImpositionRequest();

            assertThat(req.toString()).isNotNull().contains("spineLocation=LEFT");
        }
    }
}
