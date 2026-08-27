package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("FlattenRequest")
class FlattenRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("flattenOnlyForms and renderDpi default to null")
        void defaultsNull() {
            FlattenRequest req = new FlattenRequest();
            assertThat(req.getFlattenOnlyForms()).isNull();
            assertThat(req.getRenderDpi()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            FlattenRequest req = new FlattenRequest();
            req.setFlattenOnlyForms(Boolean.TRUE);
            req.setRenderDpi(150);
            assertThat(req.getFlattenOnlyForms()).isTrue();
            assertThat(req.getRenderDpi()).isEqualTo(150);
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            FlattenRequest req = new FlattenRequest();
            req.setFileId("file-3");
            assertThat(req.getFileId()).isEqualTo("file-3");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            FlattenRequest a = new FlattenRequest();
            FlattenRequest b = new FlattenRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            FlattenRequest a = new FlattenRequest();
            FlattenRequest b = new FlattenRequest();
            b.setFlattenOnlyForms(Boolean.TRUE);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            FlattenRequest a = new FlattenRequest();
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
            FlattenRequest req = new FlattenRequest();
            req.setFlattenOnlyForms(Boolean.TRUE);
            assertThat(req.toString()).isNotNull().contains("flattenOnlyForms=true");
        }
    }
}
