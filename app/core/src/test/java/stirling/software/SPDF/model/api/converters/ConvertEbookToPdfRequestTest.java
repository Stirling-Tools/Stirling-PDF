package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ConvertEbookToPdfRequest")
class ConvertEbookToPdfRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "book.epub", "application/epub+zip", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("boolean wrappers and file start null on a fresh instance")
        void defaultValues() {
            ConvertEbookToPdfRequest req = new ConvertEbookToPdfRequest();

            assertThat(req.getFileInput()).isNull();
            assertThat(req.getEmbedAllFonts()).isNull();
            assertThat(req.getIncludeTableOfContents()).isNull();
            assertThat(req.getIncludePageNumbers()).isNull();
            assertThat(req.getOptimizeForEbook()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            ConvertEbookToPdfRequest req = new ConvertEbookToPdfRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setEmbedAllFonts(Boolean.TRUE);
            req.setIncludeTableOfContents(Boolean.TRUE);
            req.setIncludePageNumbers(Boolean.FALSE);
            req.setOptimizeForEbook(Boolean.TRUE);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getEmbedAllFonts()).isTrue();
            assertThat(req.getIncludeTableOfContents()).isTrue();
            assertThat(req.getIncludePageNumbers()).isFalse();
            assertThat(req.getOptimizeForEbook()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            ConvertEbookToPdfRequest a = new ConvertEbookToPdfRequest();
            ConvertEbookToPdfRequest b = new ConvertEbookToPdfRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            ConvertEbookToPdfRequest a = new ConvertEbookToPdfRequest();
            ConvertEbookToPdfRequest b = new ConvertEbookToPdfRequest();
            b.setEmbedAllFonts(Boolean.TRUE);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ConvertEbookToPdfRequest req = new ConvertEbookToPdfRequest();
            req.setEmbedAllFonts(Boolean.TRUE);

            assertThat(req.toString()).isNotNull().contains("embedAllFonts=true");
        }
    }
}
