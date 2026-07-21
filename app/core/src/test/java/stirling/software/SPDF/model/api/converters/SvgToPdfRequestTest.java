package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("SvgToPdfRequest")
class SvgToPdfRequestTest {

    private static MultipartFile[] files() {
        return new MultipartFile[] {
            new MockMultipartFile("fileInput", "a.svg", "image/svg+xml", new byte[] {1})
        };
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            SvgToPdfRequest req = new SvgToPdfRequest();
            MultipartFile[] f = files();
            req.setFileInput(f);
            req.setCombineIntoSinglePdf(Boolean.TRUE);

            assertThat(req.getFileInput()).isSameAs(f).hasSize(1);
            assertThat(req.getCombineIntoSinglePdf()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            SvgToPdfRequest a = new SvgToPdfRequest();
            SvgToPdfRequest b = new SvgToPdfRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            SvgToPdfRequest a = new SvgToPdfRequest();
            SvgToPdfRequest b = new SvgToPdfRequest();
            b.setCombineIntoSinglePdf(Boolean.TRUE);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            SvgToPdfRequest req = new SvgToPdfRequest();
            req.setCombineIntoSinglePdf(Boolean.TRUE);

            assertThat(req.toString()).isNotNull().contains("combineIntoSinglePdf=true");
        }
    }
}
