package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("SplitPdfBySizeOrCountRequest")
class SplitPdfBySizeOrCountRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("splitType zero and splitValue null on a fresh instance")
        void defaultValues() {
            SplitPdfBySizeOrCountRequest req = new SplitPdfBySizeOrCountRequest();

            assertThat(req.getSplitType()).isZero();
            assertThat(req.getSplitValue()).isNull();
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            SplitPdfBySizeOrCountRequest req = new SplitPdfBySizeOrCountRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setSplitType(1);
            req.setSplitValue("5");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getSplitType()).isEqualTo(1);
            assertThat(req.getSplitValue()).isEqualTo("5");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            SplitPdfBySizeOrCountRequest a = new SplitPdfBySizeOrCountRequest();
            SplitPdfBySizeOrCountRequest b = new SplitPdfBySizeOrCountRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            SplitPdfBySizeOrCountRequest a = new SplitPdfBySizeOrCountRequest();
            SplitPdfBySizeOrCountRequest b = new SplitPdfBySizeOrCountRequest();
            b.setSplitType(2);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            SplitPdfBySizeOrCountRequest req = new SplitPdfBySizeOrCountRequest();
            req.setSplitValue("10MB");

            assertThat(req.toString()).isNotNull().contains("splitValue=10MB");
        }
    }
}
