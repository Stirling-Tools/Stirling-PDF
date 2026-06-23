package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("OverlayPdfsRequest")
class OverlayPdfsRequestTest {

    private static MultipartFile[] overlays() {
        return new MultipartFile[] {
            new MockMultipartFile("overlayFiles", "o.pdf", "application/pdf", new byte[] {9})
        };
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("array and string fields null, int field zero on a fresh instance")
        void defaultValues() {
            OverlayPdfsRequest req = new OverlayPdfsRequest();

            assertThat(req.getOverlayFiles()).isNull();
            assertThat(req.getOverlayMode()).isNull();
            assertThat(req.getCounts()).isNull();
            assertThat(req.getOverlayPosition()).isZero();
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            OverlayPdfsRequest req = new OverlayPdfsRequest();
            MultipartFile base = new MockMultipartFile("fileInput", new byte[] {1});
            MultipartFile[] ov = overlays();
            int[] counts = {1, 2, 3};
            req.setFileInput(base);
            req.setOverlayFiles(ov);
            req.setOverlayMode("InterleavedOverlay");
            req.setCounts(counts);
            req.setOverlayPosition(1);

            assertThat(req.getFileInput()).isSameAs(base);
            assertThat(req.getOverlayFiles()).isSameAs(ov);
            assertThat(req.getOverlayMode()).isEqualTo("InterleavedOverlay");
            assertThat(req.getCounts()).containsExactly(1, 2, 3);
            assertThat(req.getOverlayPosition()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            OverlayPdfsRequest a = new OverlayPdfsRequest();
            OverlayPdfsRequest b = new OverlayPdfsRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            OverlayPdfsRequest a = new OverlayPdfsRequest();
            OverlayPdfsRequest b = new OverlayPdfsRequest();
            b.setOverlayPosition(1);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            OverlayPdfsRequest req = new OverlayPdfsRequest();
            req.setOverlayMode("SequentialOverlay");

            assertThat(req.toString()).isNotNull().contains("overlayMode=SequentialOverlay");
        }
    }
}
