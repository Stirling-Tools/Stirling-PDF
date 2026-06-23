package stirling.software.SPDF.model.api.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PageSizeRequest")
class PageSizeRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("standardPageSize and inherited comparator null on a fresh instance")
        void defaultValues() {
            PageSizeRequest req = new PageSizeRequest();

            assertThat(req.getStandardPageSize()).isNull();
            assertThat(req.getComparator()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited comparator")
        void setters() {
            PageSizeRequest req = new PageSizeRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setStandardPageSize("A4");
            req.setComparator("Less");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getStandardPageSize()).isEqualTo("A4");
            assertThat(req.getComparator()).isEqualTo("Less");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            PageSizeRequest a = new PageSizeRequest();
            PageSizeRequest b = new PageSizeRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PageSizeRequest a = new PageSizeRequest();
            PageSizeRequest b = new PageSizeRequest();
            b.setStandardPageSize("A3");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PageSizeRequest req = new PageSizeRequest();
            req.setStandardPageSize("LETTER");

            assertThat(req.toString()).isNotNull().contains("standardPageSize=LETTER");
        }
    }
}
