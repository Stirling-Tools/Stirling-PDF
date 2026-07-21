package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("MergeMultiplePagesRequest")
class MergeMultiplePagesRequestTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("pagesPerSheet defaults to 2 and other fields null/zero")
        void defaultValues() {
            MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();

            assertThat(req.getPagesPerSheet()).isEqualTo(2);
            assertThat(req.getMode()).isNull();
            assertThat(req.getArrangement()).isNull();
            assertThat(req.getReadingDirection()).isNull();
            assertThat(req.getRows()).isZero();
            assertThat(req.getCols()).isZero();
            assertThat(req.getOrientation()).isNull();
            assertThat(req.getInnerMargin()).isZero();
            assertThat(req.getTopMargin()).isZero();
            assertThat(req.getBottomMargin()).isZero();
            assertThat(req.getLeftMargin()).isZero();
            assertThat(req.getRightMargin()).isZero();
            assertThat(req.getBorderWidth()).isZero();
            assertThat(req.getAddBorder()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
            MultipartFile f = file();
            req.setFileInput(f);
            req.setMode("CUSTOM");
            req.setPagesPerSheet(4);
            req.setArrangement("BY_COLUMNS");
            req.setReadingDirection("RTL");
            req.setRows(3);
            req.setCols(2);
            req.setOrientation("LANDSCAPE");
            req.setInnerMargin(5);
            req.setTopMargin(6);
            req.setBottomMargin(7);
            req.setLeftMargin(8);
            req.setRightMargin(9);
            req.setBorderWidth(2);
            req.setAddBorder(true);

            assertThat(req.getFileInput()).isSameAs(f);
            assertThat(req.getMode()).isEqualTo("CUSTOM");
            assertThat(req.getPagesPerSheet()).isEqualTo(4);
            assertThat(req.getArrangement()).isEqualTo("BY_COLUMNS");
            assertThat(req.getReadingDirection()).isEqualTo("RTL");
            assertThat(req.getRows()).isEqualTo(3);
            assertThat(req.getCols()).isEqualTo(2);
            assertThat(req.getOrientation()).isEqualTo("LANDSCAPE");
            assertThat(req.getInnerMargin()).isEqualTo(5);
            assertThat(req.getTopMargin()).isEqualTo(6);
            assertThat(req.getBottomMargin()).isEqualTo(7);
            assertThat(req.getLeftMargin()).isEqualTo(8);
            assertThat(req.getRightMargin()).isEqualTo(9);
            assertThat(req.getBorderWidth()).isEqualTo(2);
            assertThat(req.getAddBorder()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            MergeMultiplePagesRequest a = new MergeMultiplePagesRequest();
            MergeMultiplePagesRequest b = new MergeMultiplePagesRequest();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            MergeMultiplePagesRequest a = new MergeMultiplePagesRequest();
            MergeMultiplePagesRequest b = new MergeMultiplePagesRequest();
            b.setPagesPerSheet(16);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
            req.setMode("CUSTOM");

            assertThat(req.toString()).isNotNull().contains("mode=CUSTOM");
        }
    }
}
