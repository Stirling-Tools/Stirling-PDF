package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ScalePagesRequest")
class ScalePagesRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("scaleFactor zero and inherited orientation PORTRAIT")
        void defaultValues() {
            ScalePagesRequest req = new ScalePagesRequest();

            assertThat(req.getScaleFactor()).isEqualTo(0f);
            assertThat(req.getOrientation()).isEqualTo("PORTRAIT");
            assertThat(req.getPageSize()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited page size")
        void setters() {
            ScalePagesRequest req = new ScalePagesRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setScaleFactor(1.5f);
            req.setPageSize("A4");
            req.setOrientation("LANDSCAPE");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getScaleFactor()).isEqualTo(1.5f);
            assertThat(req.getPageSize()).isEqualTo("A4");
            assertThat(req.getOrientation()).isEqualTo("LANDSCAPE");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            ScalePagesRequest a = new ScalePagesRequest();
            ScalePagesRequest b = new ScalePagesRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            ScalePagesRequest a = new ScalePagesRequest();
            a.setScaleFactor(1f);
            ScalePagesRequest b = new ScalePagesRequest();
            b.setScaleFactor(2f);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ScalePagesRequest req = new ScalePagesRequest();
            req.setScaleFactor(2f);

            assertThat(req.toString()).isNotNull().contains("scaleFactor=2");
        }
    }
}
