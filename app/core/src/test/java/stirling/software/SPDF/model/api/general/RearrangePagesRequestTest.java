package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("RearrangePagesRequest")
class RearrangePagesRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("customMode and inherited pageNumbers null on a fresh instance")
        void defaultValues() {
            RearrangePagesRequest req = new RearrangePagesRequest();

            assertThat(req.getCustomMode()).isNull();
            assertThat(req.getPageNumbers()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited pageNumbers")
        void setters() {
            RearrangePagesRequest req = new RearrangePagesRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setCustomMode("REVERSE_ORDER");
            req.setPageNumbers("1,3,5");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getCustomMode()).isEqualTo("REVERSE_ORDER");
            assertThat(req.getPageNumbers()).isEqualTo("1,3,5");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            RearrangePagesRequest a = new RearrangePagesRequest();
            RearrangePagesRequest b = new RearrangePagesRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            RearrangePagesRequest a = new RearrangePagesRequest();
            RearrangePagesRequest b = new RearrangePagesRequest();
            b.setCustomMode("REVERSE_ORDER");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            RearrangePagesRequest req = new RearrangePagesRequest();
            req.setCustomMode("BOOKLET_SORT");

            assertThat(req.toString()).isNotNull().contains("customMode=BOOKLET_SORT");
        }
    }
}
