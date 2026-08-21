package stirling.software.SPDF.model.api.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ContainsTextRequest")
class ContainsTextRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("text and inherited pageNumbers null on a fresh instance")
        void defaultValues() {
            ContainsTextRequest req = new ContainsTextRequest();

            assertThat(req.getText()).isNull();
            assertThat(req.getPageNumbers()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited pageNumbers")
        void setters() {
            ContainsTextRequest req = new ContainsTextRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setText("hello");
            req.setPageNumbers("all");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getText()).isEqualTo("hello");
            assertThat(req.getPageNumbers()).isEqualTo("all");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            ContainsTextRequest a = new ContainsTextRequest();
            ContainsTextRequest b = new ContainsTextRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            ContainsTextRequest a = new ContainsTextRequest();
            ContainsTextRequest b = new ContainsTextRequest();
            b.setText("other");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ContainsTextRequest req = new ContainsTextRequest();
            req.setText("needle");

            assertThat(req.toString()).isNotNull().contains("text=needle");
        }
    }
}
