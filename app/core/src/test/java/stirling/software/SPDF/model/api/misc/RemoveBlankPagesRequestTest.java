package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("RemoveBlankPagesRequest")
class RemoveBlankPagesRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("primitive fields default to zero on a fresh instance")
        void defaultsZero() {
            RemoveBlankPagesRequest req = new RemoveBlankPagesRequest();
            assertThat(req.getThreshold()).isZero();
            assertThat(req.getWhitePercent()).isEqualTo(0f);
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            RemoveBlankPagesRequest req = new RemoveBlankPagesRequest();
            req.setThreshold(10);
            req.setWhitePercent(99.9f);
            assertThat(req.getThreshold()).isEqualTo(10);
            assertThat(req.getWhitePercent()).isEqualTo(99.9f);
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            RemoveBlankPagesRequest req = new RemoveBlankPagesRequest();
            req.setFileId("file-9");
            assertThat(req.getFileId()).isEqualTo("file-9");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            RemoveBlankPagesRequest a = new RemoveBlankPagesRequest();
            RemoveBlankPagesRequest b = new RemoveBlankPagesRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            RemoveBlankPagesRequest a = new RemoveBlankPagesRequest();
            RemoveBlankPagesRequest b = new RemoveBlankPagesRequest();
            b.setThreshold(50);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            RemoveBlankPagesRequest a = new RemoveBlankPagesRequest();
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
            RemoveBlankPagesRequest req = new RemoveBlankPagesRequest();
            req.setThreshold(10);
            assertThat(req.toString()).isNotNull().contains("threshold=10");
        }
    }
}
