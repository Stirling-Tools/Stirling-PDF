package stirling.software.SPDF.model.api.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("PageRotationRequest")
class PageRotationRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("rotation zero and inherited comparator null on a fresh instance")
        void defaultValues() {
            PageRotationRequest req = new PageRotationRequest();

            assertThat(req.getRotation()).isZero();
            assertThat(req.getComparator()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited comparator")
        void setters() {
            PageRotationRequest req = new PageRotationRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setRotation(90);
            req.setComparator("Equal");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getRotation()).isEqualTo(90);
            assertThat(req.getComparator()).isEqualTo("Equal");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            PageRotationRequest a = new PageRotationRequest();
            PageRotationRequest b = new PageRotationRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            PageRotationRequest a = new PageRotationRequest();
            PageRotationRequest b = new PageRotationRequest();
            b.setRotation(180);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            PageRotationRequest req = new PageRotationRequest();
            req.setRotation(270);

            assertThat(req.toString()).isNotNull().contains("rotation=270");
        }
    }
}
