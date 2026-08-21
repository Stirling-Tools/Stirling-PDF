package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("ProcessPdfWithOcrRequest")
class ProcessPdfWithOcrRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("documented default field values on a fresh instance")
        void documentedDefaults() {
            ProcessPdfWithOcrRequest req = new ProcessPdfWithOcrRequest();
            assertThat(req.getOcrRenderType()).isEqualTo("hocr");
            assertThat(req.getLanguages()).isNull();
            assertThat(req.isSidecar()).isFalse();
            assertThat(req.isDeskew()).isFalse();
            assertThat(req.isClean()).isFalse();
            assertThat(req.isCleanFinal()).isFalse();
            assertThat(req.getOcrType()).isNull();
            assertThat(req.isRemoveImagesAfter()).isFalse();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            ProcessPdfWithOcrRequest req = new ProcessPdfWithOcrRequest();
            List<String> langs = List.of("eng", "deu");
            req.setLanguages(langs);
            req.setSidecar(true);
            req.setDeskew(true);
            req.setClean(true);
            req.setCleanFinal(true);
            req.setOcrType("force-ocr");
            req.setOcrRenderType("sandwich");
            req.setRemoveImagesAfter(true);

            assertThat(req.getLanguages()).containsExactly("eng", "deu");
            assertThat(req.isSidecar()).isTrue();
            assertThat(req.isDeskew()).isTrue();
            assertThat(req.isClean()).isTrue();
            assertThat(req.isCleanFinal()).isTrue();
            assertThat(req.getOcrType()).isEqualTo("force-ocr");
            assertThat(req.getOcrRenderType()).isEqualTo("sandwich");
            assertThat(req.isRemoveImagesAfter()).isTrue();
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            ProcessPdfWithOcrRequest req = new ProcessPdfWithOcrRequest();
            req.setFileId("file-8");
            assertThat(req.getFileId()).isEqualTo("file-8");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            ProcessPdfWithOcrRequest a = new ProcessPdfWithOcrRequest();
            ProcessPdfWithOcrRequest b = new ProcessPdfWithOcrRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            ProcessPdfWithOcrRequest a = new ProcessPdfWithOcrRequest();
            ProcessPdfWithOcrRequest b = new ProcessPdfWithOcrRequest();
            b.setSidecar(true);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            ProcessPdfWithOcrRequest a = new ProcessPdfWithOcrRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null and contains a field value")
        void toStringContainsField() {
            ProcessPdfWithOcrRequest req = new ProcessPdfWithOcrRequest();
            req.setOcrType("Normal");
            assertThat(req.toString()).isNotNull().contains("ocrType=Normal");
        }
    }
}
