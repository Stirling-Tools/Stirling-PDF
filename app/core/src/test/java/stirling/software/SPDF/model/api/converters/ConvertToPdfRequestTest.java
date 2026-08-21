package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ConvertToPdfRequest")
class ConvertToPdfRequestTest {

    private static MultipartFile[] files() {
        return new MultipartFile[] {
            new MockMultipartFile("fileInput", "a.png", "image/png", new byte[] {1}),
            new MockMultipartFile("fileInput", "b.png", "image/png", new byte[] {2})
        };
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            ConvertToPdfRequest req = new ConvertToPdfRequest();
            MultipartFile[] f = files();
            req.setFileInput(f);
            req.setFitOption("fitDocumentToImage");
            req.setColorType("greyscale");
            req.setAutoRotate(Boolean.TRUE);

            assertThat(req.getFileInput()).isSameAs(f).hasSize(2);
            assertThat(req.getFitOption()).isEqualTo("fitDocumentToImage");
            assertThat(req.getColorType()).isEqualTo("greyscale");
            assertThat(req.getAutoRotate()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            ConvertToPdfRequest a = new ConvertToPdfRequest();
            ConvertToPdfRequest b = new ConvertToPdfRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            ConvertToPdfRequest a = new ConvertToPdfRequest();
            ConvertToPdfRequest b = new ConvertToPdfRequest();
            b.setFitOption("maintainAspectRatio");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ConvertToPdfRequest req = new ConvertToPdfRequest();
            req.setColorType("blackwhite");

            assertThat(req.toString()).isNotNull().contains("colorType=blackwhite");
        }
    }
}
