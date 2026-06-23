package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("CropPdfForm")
class CropPdfFormTest {

    private static MultipartFile file() {
        return new MockMultipartFile(
                "fileInput", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("removeDataOutsideCrop=true, autoCrop=false and coords null")
        void defaultValues() {
            CropPdfForm form = new CropPdfForm();

            assertThat(form.isRemoveDataOutsideCrop()).isTrue();
            assertThat(form.isAutoCrop()).isFalse();
            assertThat(form.getX()).isNull();
            assertThat(form.getY()).isNull();
            assertThat(form.getWidth()).isNull();
            assertThat(form.getHeight()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited")
        void setters() {
            CropPdfForm form = new CropPdfForm();
            MultipartFile f = file();
            form.setFileInput(f);
            form.setX(1f);
            form.setY(2f);
            form.setWidth(100f);
            form.setHeight(200f);
            form.setRemoveDataOutsideCrop(false);
            form.setAutoCrop(true);

            assertThat(form.getFileInput()).isSameAs(f);
            assertThat(form.getX()).isEqualTo(1f);
            assertThat(form.getY()).isEqualTo(2f);
            assertThat(form.getWidth()).isEqualTo(100f);
            assertThat(form.getHeight()).isEqualTo(200f);
            assertThat(form.isRemoveDataOutsideCrop()).isFalse();
            assertThat(form.isAutoCrop()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("two fresh default instances are equal and share a hashCode")
        void equalInstances() {
            CropPdfForm a = new CropPdfForm();
            CropPdfForm b = new CropPdfForm();

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            CropPdfForm a = new CropPdfForm();
            CropPdfForm b = new CropPdfForm();
            b.setWidth(50f);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            CropPdfForm form = new CropPdfForm();
            form.setWidth(123f);

            assertThat(form.toString()).isNotNull().contains("width=123");
        }
    }
}
