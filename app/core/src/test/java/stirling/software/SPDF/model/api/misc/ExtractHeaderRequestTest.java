package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("ExtractHeaderRequest")
class ExtractHeaderRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("useFirstTextAsFallback defaults to null")
        void useFirstTextAsFallbackDefaultsNull() {
            assertThat(new ExtractHeaderRequest().getUseFirstTextAsFallback()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("useFirstTextAsFallback round-trips")
        void useFirstTextAsFallbackRoundTrip() {
            ExtractHeaderRequest req = new ExtractHeaderRequest();
            req.setUseFirstTextAsFallback(Boolean.TRUE);
            assertThat(req.getUseFirstTextAsFallback()).isTrue();
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            ExtractHeaderRequest req = new ExtractHeaderRequest();
            req.setFileId("file-2");
            assertThat(req.getFileId()).isEqualTo("file-2");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            ExtractHeaderRequest a = new ExtractHeaderRequest();
            ExtractHeaderRequest b = new ExtractHeaderRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when useFirstTextAsFallback differs")
        void differByField() {
            ExtractHeaderRequest a = new ExtractHeaderRequest();
            ExtractHeaderRequest b = new ExtractHeaderRequest();
            b.setUseFirstTextAsFallback(Boolean.TRUE);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            ExtractHeaderRequest a = new ExtractHeaderRequest();
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
            ExtractHeaderRequest req = new ExtractHeaderRequest();
            req.setUseFirstTextAsFallback(Boolean.TRUE);
            assertThat(req.toString()).isNotNull().contains("useFirstTextAsFallback=true");
        }
    }
}
