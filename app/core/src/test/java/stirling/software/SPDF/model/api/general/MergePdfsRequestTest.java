package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("MergePdfsRequest")
class MergePdfsRequestTest {

    private static MultipartFile[] files() {
        return new MultipartFile[] {
            new MockMultipartFile("fileInput", "a.pdf", "application/pdf", new byte[] {1}),
            new MockMultipartFile("fileInput", "b.pdf", "application/pdf", new byte[] {2})
        };
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("sortType defaults to orderProvided, generateToc false, others null")
        void defaultValues() {
            MergePdfsRequest req = new MergePdfsRequest();

            assertThat(req.getSortType()).isEqualTo("orderProvided");
            assertThat(req.isGenerateToc()).isFalse();
            assertThat(req.getRemoveCertSign()).isNull();
            assertThat(req.getClientFileIds()).isNull();
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited fileInput array")
        void setters() {
            MergePdfsRequest req = new MergePdfsRequest();
            MultipartFile[] f = files();
            req.setFileInput(f);
            req.setSortType("byFileName");
            req.setRemoveCertSign(true);
            req.setGenerateToc(true);
            req.setClientFileIds("[\"x\",\"y\"]");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getSortType()).isEqualTo("byFileName");
            assertThat(req.getRemoveCertSign()).isTrue();
            assertThat(req.isGenerateToc()).isTrue();
            assertThat(req.getClientFileIds()).isEqualTo("[\"x\",\"y\"]");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            MergePdfsRequest a = new MergePdfsRequest();
            MergePdfsRequest b = new MergePdfsRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            MergePdfsRequest a = new MergePdfsRequest();
            MergePdfsRequest b = new MergePdfsRequest();
            b.setSortType("byPDFTitle");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("differing inherited fileInput array breaks equality")
        void notEqualByInheritedArray() {
            MergePdfsRequest a = new MergePdfsRequest();
            MergePdfsRequest b = new MergePdfsRequest();
            b.setFileInput(files());

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            MergePdfsRequest req = new MergePdfsRequest();

            assertThat(req.toString()).isNotNull().contains("sortType=orderProvided");
        }
    }
}
