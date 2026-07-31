package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PosterPdfRequest")
class PosterPdfRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("pageSize=A4, xFactor=2, yFactor=2, rightToLeft=false")
        void defaultValues() {
            PosterPdfRequest req = new PosterPdfRequest();

            assertThat(req.getPageSize()).isEqualTo("A4");
            assertThat(req.getXFactor()).isEqualTo(2);
            assertThat(req.getYFactor()).isEqualTo(2);
            assertThat(req.isRightToLeft()).isFalse();
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            PosterPdfRequest req = new PosterPdfRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setPageSize("A3");
            req.setXFactor(5);
            req.setYFactor(7);
            req.setRightToLeft(true);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getPageSize()).isEqualTo("A3");
            assertThat(req.getXFactor()).isEqualTo(5);
            assertThat(req.getYFactor()).isEqualTo(7);
            assertThat(req.isRightToLeft()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            PosterPdfRequest a = new PosterPdfRequest();
            PosterPdfRequest b = new PosterPdfRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PosterPdfRequest a = new PosterPdfRequest();
            PosterPdfRequest b = new PosterPdfRequest();
            b.setXFactor(9);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PosterPdfRequest req = new PosterPdfRequest();

            assertThat(req.toString()).isNotNull().contains("pageSize=A4");
        }
    }
}
