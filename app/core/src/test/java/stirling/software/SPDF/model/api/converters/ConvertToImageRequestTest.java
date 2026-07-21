package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ConvertToImageRequest")
class ConvertToImageRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip subclass fields")
        void subclassFields() {
            ConvertToImageRequest req = new ConvertToImageRequest();
            req.setImageFormat("png");
            req.setSingleOrMultiple("single");
            req.setColorType("greyscale");
            req.setDpi(300);
            req.setIncludeAnnotations(Boolean.TRUE);

            assertThat(req.getImageFormat()).isEqualTo("png");
            assertThat(req.getSingleOrMultiple()).isEqualTo("single");
            assertThat(req.getColorType()).isEqualTo("greyscale");
            assertThat(req.getDpi()).isEqualTo(300);
            assertThat(req.getIncludeAnnotations()).isTrue();
        }

        @Test
        @DisplayName("setters round trip inherited fields")
        void inheritedFields() {
            ConvertToImageRequest req = new ConvertToImageRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setFileId("file-123");
            req.setPageNumbers("1,3,5-9");

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getFileId()).isEqualTo("file-123");
            assertThat(req.getPageNumbers()).isEqualTo("1,3,5-9");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("fresh instances are equal despite callSuper")
        void equalInstances() {
            ConvertToImageRequest a = new ConvertToImageRequest();
            ConvertToImageRequest b = new ConvertToImageRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqualSubclass() {
            ConvertToImageRequest a = new ConvertToImageRequest();
            ConvertToImageRequest b = new ConvertToImageRequest();
            b.setImageFormat("jpeg");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("differing inherited field breaks equality")
        void notEqualInherited() {
            ConvertToImageRequest a = new ConvertToImageRequest();
            ConvertToImageRequest b = new ConvertToImageRequest();
            b.setPageNumbers("2");

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ConvertToImageRequest req = new ConvertToImageRequest();
            req.setImageFormat("png");

            assertThat(req.toString()).isNotNull().contains("imageFormat=png");
        }
    }
}
