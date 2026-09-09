package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("AutoSplitPdfRequest")
class AutoSplitPdfRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("duplexMode defaults to null")
        void duplexModeDefaultsNull() {
            assertThat(new AutoSplitPdfRequest().getDuplexMode()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("duplexMode round-trips")
        void duplexModeRoundTrip() {
            AutoSplitPdfRequest req = new AutoSplitPdfRequest();
            req.setDuplexMode(Boolean.TRUE);
            assertThat(req.getDuplexMode()).isTrue();
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            AutoSplitPdfRequest req = new AutoSplitPdfRequest();
            req.setFileId("file-77");
            assertThat(req.getFileId()).isEqualTo("file-77");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            AutoSplitPdfRequest a = new AutoSplitPdfRequest();
            AutoSplitPdfRequest b = new AutoSplitPdfRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when duplexMode differs")
        void differByDuplexMode() {
            AutoSplitPdfRequest a = new AutoSplitPdfRequest();
            AutoSplitPdfRequest b = new AutoSplitPdfRequest();
            b.setDuplexMode(Boolean.TRUE);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            AutoSplitPdfRequest a = new AutoSplitPdfRequest();
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
            AutoSplitPdfRequest req = new AutoSplitPdfRequest();
            req.setDuplexMode(Boolean.TRUE);
            assertThat(req.toString()).isNotNull().contains("duplexMode=true");
        }
    }
}
