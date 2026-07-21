package stirling.software.SPDF.model.api.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("FileSizeRequest")
class FileSizeRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("fileSize zero and inherited comparator null on a fresh instance")
        void defaultValues() {
            FileSizeRequest req = new FileSizeRequest();

            assertThat(req.getFileSize()).isZero();
            assertThat(req.getComparator()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited comparator")
        void setters() {
            FileSizeRequest req = new FileSizeRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setFileSize(1024L);
            req.setComparator("Greater");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getFileSize()).isEqualTo(1024L);
            assertThat(req.getComparator()).isEqualTo("Greater");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            FileSizeRequest a = new FileSizeRequest();
            FileSizeRequest b = new FileSizeRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            FileSizeRequest a = new FileSizeRequest();
            FileSizeRequest b = new FileSizeRequest();
            b.setFileSize(99L);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            FileSizeRequest req = new FileSizeRequest();
            req.setFileSize(2048L);

            assertThat(req.toString()).isNotNull().contains("fileSize=2048");
        }
    }
}
