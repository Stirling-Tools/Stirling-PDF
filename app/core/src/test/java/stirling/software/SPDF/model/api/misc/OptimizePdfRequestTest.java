package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("OptimizePdfRequest")
class OptimizePdfRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("documented default field values on a fresh instance")
        void documentedDefaults() {
            OptimizePdfRequest req = new OptimizePdfRequest();
            assertThat(req.getOptimizeLevel()).isEqualTo(5);
            assertThat(req.getLinearize()).isFalse();
            assertThat(req.getNormalize()).isFalse();
            assertThat(req.getGrayscale()).isFalse();
            assertThat(req.getLineArt()).isFalse();
            assertThat(req.getLineArtThreshold()).isEqualTo(55d);
            assertThat(req.getLineArtEdgeLevel()).isEqualTo(1);
            assertThat(req.getExpectedOutputSize()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            OptimizePdfRequest req = new OptimizePdfRequest();
            req.setOptimizeLevel(9);
            req.setExpectedOutputSize("100MB");
            req.setLinearize(Boolean.TRUE);
            req.setNormalize(Boolean.TRUE);
            req.setGrayscale(Boolean.TRUE);
            req.setLineArt(Boolean.TRUE);
            req.setLineArtThreshold(80d);
            req.setLineArtEdgeLevel(3);

            assertThat(req.getOptimizeLevel()).isEqualTo(9);
            assertThat(req.getExpectedOutputSize()).isEqualTo("100MB");
            assertThat(req.getLinearize()).isTrue();
            assertThat(req.getNormalize()).isTrue();
            assertThat(req.getGrayscale()).isTrue();
            assertThat(req.getLineArt()).isTrue();
            assertThat(req.getLineArtThreshold()).isEqualTo(80d);
            assertThat(req.getLineArtEdgeLevel()).isEqualTo(3);
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            OptimizePdfRequest req = new OptimizePdfRequest();
            req.setFileId("file-5");
            assertThat(req.getFileId()).isEqualTo("file-5");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            OptimizePdfRequest a = new OptimizePdfRequest();
            OptimizePdfRequest b = new OptimizePdfRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            OptimizePdfRequest a = new OptimizePdfRequest();
            OptimizePdfRequest b = new OptimizePdfRequest();
            b.setOptimizeLevel(9);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            OptimizePdfRequest a = new OptimizePdfRequest();
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
            OptimizePdfRequest req = new OptimizePdfRequest();
            req.setExpectedOutputSize("25KB");
            assertThat(req.toString()).isNotNull().contains("expectedOutputSize=25KB");
        }
    }
}
