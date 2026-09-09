package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("ConvertCbrToPdfRequest")
class ConvertCbrToPdfRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "comic.cbr", "application/x-cbr", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("optimizeForEbook defaults to false")
        void defaultValues() {
            ConvertCbrToPdfRequest req = new ConvertCbrToPdfRequest();

            assertThat(req.isOptimizeForEbook()).isFalse();
            assertThat(req.getFileInput()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round trip every field")
        void setters() {
            ConvertCbrToPdfRequest req = new ConvertCbrToPdfRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setOptimizeForEbook(true);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.isOptimizeForEbook()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            ConvertCbrToPdfRequest a = new ConvertCbrToPdfRequest();
            ConvertCbrToPdfRequest b = new ConvertCbrToPdfRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            ConvertCbrToPdfRequest a = new ConvertCbrToPdfRequest();
            ConvertCbrToPdfRequest b = new ConvertCbrToPdfRequest();
            b.setOptimizeForEbook(true);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            ConvertCbrToPdfRequest req = new ConvertCbrToPdfRequest();
            req.setOptimizeForEbook(true);

            assertThat(req.toString()).isNotNull().contains("optimizeForEbook=true");
        }
    }
}
